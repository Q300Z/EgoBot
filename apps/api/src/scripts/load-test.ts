process.env.LOG_LEVEL = "silent";
import { spawn } from "child_process";
import app from "../app";
import { connectRedisClients, redisReader } from "../config/redis";
import { SseService } from "../core/sse";
import { redisStreamBus } from "../core/stream";
import { initJobModule, startJobScheduler, stopJobModule } from "../modules/job";

import { prisma } from "../config/db";
import type { Server } from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { logger } from "../config/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3003;
const API_URL = `http://localhost:${PORT}`;
const NB_WORKERS = Number(process.env.NB_WORKERS || 5);
const NB_JOBS = Number(process.env.NB_JOBS || NB_WORKERS);

interface JobMetric {
	index: number;
	jobId: string;
	postStartOffsetMs: number; // offset from global start
	postDurationMs: number; // POST request latency
	sseConnectOffsetMs: number; // offset from global start
	sseConnectLatencyMs: number; // time between POST response and SSE connect
	streamDurationMs: number; // time from SSE connect to stream close
	chunks: Array<{ timeOffsetMs: number; count: number }>;
}

const metrics: JobMetric[] = [];

async function main() {
	logger.level = "silent";
	console.log("🚀 Lancement de la suite de test de charge et de stress...");

	// 1. Start the Python validator workers in the background
	const numWorkers = NB_WORKERS;
	console.log(`🐍 Démarrage de ${numWorkers} workers Python...`);
	const validatorWorkerDir = path.resolve(__dirname, "../../..", "validator_worker");
	const venvPythonPath = path.join(validatorWorkerDir, ".venv/bin/python");
	const pythonExec = fs.existsSync(venvPythonPath) ? venvPythonPath : "python3";

	const pythonWorkers: Array<ReturnType<typeof spawn>> = [];
	for (let i = 0; i < numWorkers; i++) {
		pythonWorkers.push(
			spawn(pythonExec, ["run.py"], {
				cwd: validatorWorkerDir,
				stdio: "inherit",
			}),
		);
	}

	// Handle worker termination on exit
	const cleanExit = async () => {
		console.log("\n🧹 Nettoyage des processus...");
		for (const worker of pythonWorkers) {
			worker.kill("SIGTERM");
		}
		if (server) {
			server.close();
		}
		redisStreamBus.stop();
		stopJobModule();
		await prisma.$disconnect();

		try {
			console.log("🔌 Fermeture du processus de test. Connexions fermées.");
		} catch (err) {
			// ignore
		}

		console.log("👋 Nettoyage terminé. Fermeture en cours.");
		process.exit(0);
	};

	process.on("SIGINT", cleanExit);
	process.on("SIGTERM", cleanExit);

	// Allow the worker 2 seconds to initialize connections
	await new Promise((resolve) => setTimeout(resolve, 2000));

	let server: Server | null = null;
	try {
		// 2. Initialize API Services and start listening
		console.log("🔗 Connexion des clients Redis...");
		await connectRedisClients();

		SseService.init();
		redisStreamBus.start();
		initJobModule();
		startJobScheduler();

		server = app.listen(PORT, "0.0.0.0", () => {
			console.log(`🌐 API de test à l'écoute sur ${API_URL}`);
		});

		// 3. Clear database for clean test run
		console.log("🗑️ Suppression des enregistrements existants de la base de test...");
		await prisma.job.deleteMany();
		await prisma.message.deleteMany();
		await prisma.conversation.deleteMany();

		// 4. Authenticate to obtain a valid JWT token
		console.log("🔐 Authentification de l'utilisateur de test...");
		const loginRes = await fetch(`${API_URL}/api/v1/auth/login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: "http://localhost",
				model: "CHATBOT",
				email: "test@agelid.com",
				user: "test-user-id",
				client: "test-client-id",
				db_key: "test-db-key",
				dev: "true",
			}),
		});

		if (!loginRes.ok) {
			throw new Error(`Échec de la connexion : ${loginRes.statusText}`);
		}
		const loginBody = (await loginRes.json()) as any;
		const token = loginBody.data.token;
		console.log("✅ Authentification réussie.");

		// Debug Redis write check
		const debugVal = await redisReader.get("logipol:test-user-id");
		console.log(`🔍 [DEBUG] Lecture directe depuis redisReader : "${debugVal}"`);

		// 5. Verify the constraint: Max 1 active job per conversation
		console.log("🛡️ Test de la contrainte : 1 job actif maximum par conversation...");
		const testConvId = crypto.randomUUID();

		// Post the first job
		const resFirst = await fetch(`${API_URL}/api/v1/messages`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				conversation_id: testConvId,
				prompt: "lorem stress test constraint first",
			}),
		});

		if (!resFirst.ok) {
			throw new Error(`Échec de l'envoi du premier message : ${resFirst.statusText}`);
		}
		const bodyFirst = (await resFirst.json()) as any;
		const firstJobId = bodyFirst.data.job_id;
		console.log(`Premier job envoyé (Job : ${firstJobId})`);

		// Post the second job immediately on the same conversation
		const resSecond = await fetch(`${API_URL}/api/v1/messages`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				conversation_id: testConvId,
				prompt: "lorem stress test constraint second",
			}),
		});

		if (!resSecond.ok) {
			throw new Error(`Échec de l'envoi de la requête du second message : ${resSecond.statusText}`);
		}
		const bodySecond = (await resSecond.json()) as any;
		const secondJobId = bodySecond.data.job_id;
		console.log(`Requête du second job envoyée (Job : ${secondJobId})`);

		// Wait a brief moment for the asynchronous event bus to process the job requests
		await new Promise((resolve) => setTimeout(resolve, 300));

		// Verify if second job was created in DB
		const dbSecondJob = await prisma.job.findUnique({
			where: { id: secondJobId },
		});

		if (!dbSecondJob) {
			console.log("✅ SUCCÈS : le second job a bien été bloqué et n'a jamais été créé en base.");
		} else {
			throw new Error("❌ ÉCHEC : le second job a été créé à tort en base pendant une conversation active !");
		}

		// Attente de la complétion du premier job
		console.log(`⏳ Attente de la complétion du premier job ${firstJobId}...`);
		let firstJobDb = await prisma.job.findUnique({ where: { id: firstJobId } });
		while (!firstJobDb || (firstJobDb.status !== "COMPLETED" && firstJobDb.status !== "FAILED")) {
			console.log(`[DEBUG wait loop] Job ${firstJobId} DB status: ${firstJobDb?.status}`);
			await new Promise((r) => setTimeout(r, 300));
			firstJobDb = await prisma.job.findUnique({ where: { id: firstJobId } });
		}
		console.log(`✅ Premier job ${firstJobId} terminé (Statut: ${firstJobDb?.status}). Passage au test de charge.`);

		// 6. Spawn 5 parallel conversations and process them in parallel
		const numParallel = NB_JOBS;
		console.log(`⚡ Lancement du test de charge avec ${numParallel} jobs parallèles...`);
		const conversationIds = Array.from({ length: numParallel }, () => crypto.randomUUID());
		const globalStart = Date.now();

		const loadTestPromises = conversationIds.map(async (convId, index) => {
			const postStart = Date.now();
			const relativePostStart = postStart - globalStart;

			// Post request
			const postRes = await fetch(`${API_URL}/api/v1/messages`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					conversation_id: convId,
					prompt: `lorem load test job number ${index}`,
				}),
			});

			const postEnd = Date.now();
			const postDuration = postEnd - postStart;

			if (!postRes.ok) {
				throw new Error(`Échec de l'envoi du message pour la conversation ${index} : ${postRes.statusText}`);
			}
			const postBody = (await postRes.json()) as any;
			const jobId = postBody.data.job_id;
			console.log(`[Job ${index}] Envoyé. ID du job : ${jobId}`);

			const sseStart = Date.now();
			const relativeSseConnect = sseStart - globalStart;
			const sseConnectLatency = sseStart - postEnd;

			// Listen to SSE Stream and count paragraph tokens
			const sseRes = await fetch(`${API_URL}/sse/v1/job/${jobId}`, {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});
			if (!sseRes.ok || !sseRes.body) {
				throw new Error(`Échec de l'abonnement SSE pour le job ${jobId}`);
			}

			console.log(`[Job ${index}] Connexion SSE établie (status ${sseRes.status})`);
			const reader = sseRes.body.getReader();
			const decoder = new TextDecoder();
			let paragraphsReceived = 0;
			let finished = false;
			const streamChunks: Array<{ timeOffsetMs: number; count: number }> = [];

			while (!finished) {
				const { value, done } = await reader.read();
				if (done) {
					console.log(`[Job ${index}] Reader terminé (done=true)`);
					break;
				}
				const chunk = decoder.decode(value);

				// Compte les occurrences de Paragraph dans le flux
				const matches = chunk.match(/\[Paragraph \d+\]/g);
				if (matches) {
					paragraphsReceived += matches.length;
					streamChunks.push({
						timeOffsetMs: Date.now() - sseStart,
						count: paragraphsReceived,
					});
				}

				if (chunk.includes("job.done") || chunk.includes("COMPLETED")) {
					console.log(`[Job ${index}] Signal de fin reçu dans le chunk`);
					finished = true;
				}
			}

			const streamDuration = Date.now() - sseStart;

			metrics.push({
				index,
				jobId,
				postStartOffsetMs: relativePostStart,
				postDurationMs: postDuration,
				sseConnectOffsetMs: relativeSseConnect,
				sseConnectLatencyMs: sseConnectLatency,
				streamDurationMs: streamDuration,
				chunks: streamChunks,
			});

			console.log(`[Job ${index}] Flux terminé. Paragraphes reçus : ${paragraphsReceived}/100`);
			if (paragraphsReceived !== 100) {
				console.warn(`[Job ${index}] Avertissement : 100 paragraphes attendus, ${paragraphsReceived} reçus`);
			}
		});

		await Promise.all(loadTestPromises);
		const globalDuration = (Date.now() - globalStart) / 1000;
		console.log(`\n🎉 Tous les jobs parallèles ont terminé le streaming en ${globalDuration.toFixed(2)} s.`);

		// 7. Verify Database Records
		// Attente de 500ms pour garantir que toutes les écritures asynchrones SQLite sont validées
		await new Promise((resolve) => setTimeout(resolve, 500));

		console.log("📊 Validation des enregistrements de la base...");
		const dbJobs = await prisma.job.findMany({
			include: {
				assistant_message: true,
			},
		});

		console.log(`${dbJobs.length} jobs trouvés dans la base de données.`);
		let successCount = 0;

		for (const job of dbJobs) {
			const isCompleted = job.status === "COMPLETED";
			const content = job.assistant_message?.content || "";
			const hasLorem = content.includes("Lorem ipsum") && content.includes("[Paragraph 100]");

			if (isCompleted && hasLorem) {
				successCount++;
				console.log(`✅ Job ${job.id} : statut TERMINÉ, contenu validé avec succès en base.`);
			} else {
				console.log(
					`❌ Job ${job.id} : validation échouée. Statut : ${job.status}, longueur du contenu : ${content.length}`,
				);
			}
		}

		const testPassed = successCount === dbJobs.length && successCount > 0;

		if (testPassed) {
			console.log(
				"\n🟢 TEST DE CHARGE RÉUSSI ! Tous les jobs concurrents ont été traités, mis en file et stockés correctement.",
			);
		} else {
			console.log(`\n🔴 TEST DE CHARGE ÉCHOUÉ ! Seuls ${successCount}/${dbJobs.length} jobs ont passé la validation.`);
		}

		// 8. Generate HTML Performance Report
		console.log("📈 Génération du tableau de bord HTML du rapport de performance...");
		writeHtmlReport(metrics, globalDuration, testPassed);
	} catch (error) {
		console.error("❌ Erreur critique pendant le test de charge :", error);
	} finally {
		await cleanExit();
	}
}

function writeHtmlReport(data: JobMetric[], globalDuration: number, success: boolean) {
	const reportPath = path.join(process.cwd(), "load-test-report.html");

	// Calculate aggregate metrics
	const avgPostDuration = data.reduce((acc, m) => acc + m.postDurationMs, 0) / data.length;
	const avgSseLatency = data.reduce((acc, m) => acc + m.sseConnectLatencyMs, 0) / data.length;
	const avgStreamDuration = data.reduce((acc, m) => acc + m.streamDurationMs, 0) / data.length;

	const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rapport de Test de Charge - AGELID API</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Plus+Jakarta+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg-color: #0b0f19;
      --card-bg: #151c2c;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #4f46e5;
      --primary-glow: rgba(79, 70, 229, 0.4);
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.2);
      --danger: #ef4444;
      --danger-glow: rgba(239, 68, 68, 0.2);
      --border: #243049;
    }

    body {
      background-color: var(--bg-color);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', sans-serif;
      margin: 0;
      padding: 40px 20px;
      line-height: 1.6;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    header {
      text-align: center;
      margin-bottom: 50px;
    }

    h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 2.8rem;
      font-weight: 800;
      margin: 0 0 10px 0;
      background: linear-gradient(135deg, #a78bfa 0%, #4f46e5 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 1.1rem;
    }

    .status-badge {
      display: inline-block;
      padding: 8px 24px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 1rem;
      margin-top: 15px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .status-badge.success {
      background-color: var(--success-glow);
      color: var(--success);
      border: 1px solid var(--success);
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.1);
    }

    .status-badge.fail {
      background-color: var(--danger-glow);
      color: var(--danger);
      border: 1px solid var(--danger);
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.1);
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 25px;
      margin-bottom: 50px;
    }

    .card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      transition: transform 0.3s ease, border-color 0.3s ease;
    }

    .card:hover {
      transform: translateY(-5px);
      border-color: var(--primary);
    }

    .card-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }

    .card-value {
      font-size: 2.2rem;
      font-weight: 800;
      color: var(--text-main);
      font-family: 'Outfit', sans-serif;
    }

    .card-unit {
      font-size: 1rem;
      font-weight: 400;
      color: var(--text-muted);
    }

    .chart-container {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 30px;
      margin-bottom: 40px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    }

    .chart-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.4rem;
      font-weight: 600;
      margin-bottom: 25px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .chart-title::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 24px;
      background-color: var(--primary);
      border-radius: 3px;
    }

    .grid-two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
    }

    @media (max-width: 900px) {
      .grid-two {
        grid-template-columns: 1fr;
      }
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }

    th, td {
      padding: 16px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    th {
      font-weight: 600;
      color: var(--text-muted);
    }

    tr:hover {
      background-color: rgba(255, 255, 255, 0.02);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Tableau de Performance - Test de Charge</h1>
      <div class="subtitle">Analyse comparative et métriques des requêtes concurrentes (AGELID API)</div>
      <div class="status-badge ${success ? "success" : "fail"}">
        ${success ? "Succès (0% Erreur)" : "Échec détecté"}
      </div>
    </header>

    <div class="metrics-grid">
      <div class="card">
        <div class="card-title">Durée Globale</div>
        <div class="card-value">${globalDuration.toFixed(2)}<span class="card-unit"> s</span></div>
      </div>
      <div class="card">
        <div class="card-title">Latence POST API</div>
        <div class="card-value">${avgPostDuration.toFixed(0)}<span class="card-unit"> ms</span></div>
      </div>
      <div class="card">
        <div class="card-title">Établissement SSE</div>
        <div class="card-value">${avgSseLatency.toFixed(0)}<span class="card-unit"> ms</span></div>
      </div>
      <div class="card">
        <div class="card-title">Streaming Moyen</div>
        <div class="card-value">${(avgStreamDuration / 1000).toFixed(2)}<span class="card-unit"> s</span></div>
      </div>
    </div>

    <div class="chart-container">
      <div class="chart-title">Débit de Tokens dans le temps (Streaming Progression)</div>
      <div style="height: 380px;">
        <canvas id="progressChart"></canvas>
      </div>
    </div>

    <div class="grid-two">
      <div class="chart-container">
        <div class="chart-title">Temps de réponse POST Message (ms)</div>
        <div style="height: 280px;">
          <canvas id="postChart"></canvas>
        </div>
      </div>
      <div class="chart-container">
        <div class="chart-title">Délai de connexion SSE (ms)</div>
        <div style="height: 280px;">
          <canvas id="sseChart"></canvas>
        </div>
      </div>
    </div>

    <div class="chart-container">
      <div class="chart-title">Données Brutes de Télémétrie</div>
      <table>
        <thead>
          <tr>
            <th>Index</th>
            <th>ID du Job</th>
            <th>Délai POST (ms)</th>
            <th>Connexion SSE (ms)</th>
            <th>Durée Stream (s)</th>
          </tr>
        </thead>
        <tbody>
          ${data
						.map(
							(m) => `
            <tr>
              <td>Job ${m.index}</td>
              <td style="font-family: monospace; font-size: 0.85rem; color: var(--text-muted);">${m.jobId}</td>
              <td>${m.postDurationMs} ms</td>
              <td>${m.sseConnectLatencyMs} ms</td>
              <td>${(m.streamDurationMs / 1000).toFixed(2)} s</td>
            </tr>
          `,
						)
						.join("")}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    const metricsData = ${JSON.stringify(data)};

    // Chart.js global configurations
    Chart.defaults.color = '#9ca3af';
    Chart.defaults.borderColor = '#243049';

    // 1. Streaming Progress Chart
    const datasets = metricsData.map(m => {
      // Map data points
      const dataPoints = m.chunks.map(c => ({ x: c.timeOffsetMs / 1000, y: c.count }));
      // Add start point
      dataPoints.unshift({ x: 0, y: 0 });

      const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6'];
      return {
        label: 'Job ' + m.index,
        data: dataPoints,
        borderColor: colors[m.index % colors.length],
        backgroundColor: colors[m.index % colors.length] + '11',
        tension: 0.3,
        borderWidth: 3,
        pointRadius: 2,
        fill: true
      };
    });

    new Chart(document.getElementById('progressChart'), {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Temps écoulé depuis la connexion (s)', color: '#f3f4f6' },
            grid: { color: 'rgba(36, 48, 73, 0.5)' }
          },
          y: {
            title: { display: true, text: 'Paragraphes reçus', color: '#f3f4f6' },
            min: 0,
            max: 105,
            grid: { color: 'rgba(36, 48, 73, 0.5)' }
          }
        },
        plugins: {
          legend: { position: 'top' }
        }
      }
    });

    // 2. POST Message Latency Chart
    new Chart(document.getElementById('postChart'), {
      type: 'bar',
      data: {
        labels: metricsData.map(m => 'Job ' + m.index),
        datasets: [{
          label: 'Latence POST',
          data: metricsData.map(m => m.postDurationMs),
          backgroundColor: '#4f46e5',
          borderRadius: 8,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            title: { display: true, text: 'ms' },
            beginAtZero: true,
            grid: { color: 'rgba(36, 48, 73, 0.5)' }
          }
        }
      }
    });

    // 3. SSE Latency Chart
    new Chart(document.getElementById('sseChart'), {
      type: 'bar',
      data: {
        labels: metricsData.map(m => 'Job ' + m.index),
        datasets: [{
          label: 'Établissement SSE',
          data: metricsData.map(m => m.sseConnectLatencyMs),
          backgroundColor: '#10b981',
          borderRadius: 8,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            title: { display: true, text: 'ms' },
            beginAtZero: true,
            grid: { color: 'rgba(36, 48, 73, 0.5)' }
          }
        }
      }
    });
  </script>
</body>
</html>`;

	fs.writeFileSync(reportPath, html, "utf8");
	console.log(`\n📈 Rapport de performance généré : [load-test-report.html](file://${reportPath})`);
}

main().catch((err) => {
	console.error("Erreur fatale :", err);
	process.exit(1);
});
