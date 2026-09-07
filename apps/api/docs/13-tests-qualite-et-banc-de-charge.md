# 13. Tests, Qualité & Banc d'Essai de Charge

Le projet intègre une suite de tests unitaires/intégration sous **Vitest** et un banc de test de charge temps réel ([`src/test/`](file:///home/tboutin/Documents/AGELID/api/src/test/), [`src/scripts/load-test.ts`](file:///home/tboutin/Documents/AGELID/api/src/scripts/load-test.ts)).

---

## 🧪 Tests Unitaires & Intégration (Vitest)

### Exécution Standard

```bash
pnpm test
```

### Rapport de Couverture de Code

```bash
pnpm test:coverage
```

### ⚠️ Pourquoi `--fileParallelism=false --maxWorkers=1` ?

Dans `package.json`, Vitest est configuré avec `--fileParallelism=false --maxWorkers=1`.

- **Raison technique** : SQLite possède un verrou d'écriture exclusif (_single-writer lock_). L'exécution concurrente de 26 suites de tests sur la même base de données locale provoquerait des collisions `SQLITE_BUSY`. L'exécution séquentielle garantit un passage 100% stable en ~5 secondes.

---

## 🚀 Banc de Test de Charge Simulé (`src/scripts/load-test.ts`)

Pour valider le streaming SSE et l'enfilage Redis sans dépendre d'un serveur d'inférence Python externe, le projet fournit un script de charge interactif.

### Lancement du Banc de Charge :

```bash
pnpm test:load
```

### Ce que teste le script :

1. **Simulation de Workers IA Multiples** : Consomme les Redis Streams (`jobs:queue:prod:chatbot`), simule la latence TTFT (_Time To First Token_) et produit des chunks de réponse.
2. **Clients SSE Concurrents** : Établit plusieurs connexions HTTP SSE en parallèle et mesure la latence de réception de chaque token.
3. **Génération d'un Rapport HTML Interactif** :
   - Émet automatiquement un fichier `load-test-report.html` avec graphiques interactifs (latence moyenne, débit tokens/seconde, taux de succès).
