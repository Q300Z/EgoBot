import axios, { type AxiosInstance } from "axios";

export interface LogibotSDKConfig {
  baseUrl: string;
  token?: string;
}

export class LogibotClientSDK {
  private api: AxiosInstance;
  private token?: string;

  constructor(config: LogibotSDKConfig) {
    this.token = config.token;
    this.api = axios.create({
      baseURL: config.baseUrl,
      headers: { "Content-Type": "application/json" },
    });

    if (this.token) {
      this.setToken(this.token);
    }
  }

  setToken(token: string) {
    this.token = token;
    this.api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  }

  // Auth REST Direct Standard
  async login(email: string, password: string) {
    const res = await this.api.post("/api/v1/auth/login", { email, password });
    if (res.data.token) {
      this.setToken(res.data.token);
    }
    return res.data; // { token, user }
  }

  async register(email: string, password: string, role?: string) {
    const res = await this.api.post("/api/v1/auth/register", { email, password, role });
    if (res.data.token) {
      this.setToken(res.data.token);
    }
    return res.data; // { token, user }
  }

  async getMe() {
    const res = await this.api.get("/api/v1/auth/me");
    return res.data; // user object direct
  }

  // Messages & Conversations REST Direct Standard
  async createMessage(prompt: string, conversationId?: string, model?: string) {
    const res = await this.api.post("/api/v1/messages", {
      prompt,
      conversation_id: conversationId,
      model,
    });
    return res.data; // { job_id, conversation_id, stream_url }
  }

  async getConversations() {
    const res = await this.api.get("/api/v1/conversations");
    return res.data; // array [ conversation1, conversation2 ]
  }

  async getConversation(id: string) {
    const res = await this.api.get(`/api/v1/conversations/${id}`);
    return res.data; // conversation object
  }

  async deleteConversation(id: string) {
    const res = await this.api.delete(`/api/v1/conversations/${id}`);
    return res.data;
  }

  // Admin REST Direct Standard
  async getUsers() {
    const res = await this.api.get("/api/v1/admin/users");
    return res.data; // array [ user1, user2 ]
  }

  async createUser(data: { email: string; password: string; role: string }) {
    const res = await this.api.post("/api/v1/admin/users", data);
    return res.data;
  }

  async deleteUser(id: string) {
    const res = await this.api.delete(`/api/v1/admin/users/${id}`);
    return res.data;
  }

  async updateUser(id: string, data: { email?: string; role?: string; resetPassword?: boolean }) {
    const res = await this.api.put(`/api/v1/admin/users/${id}`, data);
    return res.data; // { id, email, role, created_at, updated_at, generatedPassword? }
  }

  /**
   * Écoute d'un flux SSE réactif avec tolérance absolue aux événements inconnus (Non-strict Event Parser).
   */
  connectJobStream(
    jobId: string,
    callbacks: {
      onToken?: (chunk: string) => void;
      onStatus?: (status: string, error?: string) => void;
      onStatistics?: (stats: any) => void;
      onUnknownEvent?: (type: string, payload: any) => void;
      onError?: (err: any) => void;
    }
  ): () => void {
    const streamUrl = `${this.api.defaults.baseURL}/sse/v1/job/${jobId}${this.token ? `?token=${this.token}` : ""}`;
    const eventSource = new EventSource(streamUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const eventType = data.type || data.kind || "unknown";
        const payload = data.payload || data;

        // L'enveloppe de complétion du worker utilise `kind: "stats"`, qui ne
        // correspond à aucun des cas du switch ci-dessous : ce déclenchement
        // est indépendant du type d'événement pour ne jamais manquer un
        // changement de statut (notamment COMPLETED/FAILED/CANCELLED).
        if (typeof payload?.status === "string" && callbacks.onStatus) {
          callbacks.onStatus(payload.status, payload.error);
        }

        switch (eventType) {
          case "token":
            if (callbacks.onToken) {
              callbacks.onToken(payload.chunk || payload.data?.chunk || "");
            }
            break;

          case "status":
            if (callbacks.onStatus) {
              callbacks.onStatus(payload.status, payload.error);
            }
            break;

          case "statistics":
            if (callbacks.onStatistics) {
              callbacks.onStatistics(payload);
            }
            break;

          default:
            // Tolérance aux événements futurs ou inconnus : ignoré silencieusement sans faire planter le SDK !
            if (callbacks.onUnknownEvent) {
              callbacks.onUnknownEvent(eventType, payload);
            }
            break;
        }
      } catch (err) {
        // Ignorer les données malformées sans planter le SDK
      }
    };

    eventSource.onerror = (err) => {
      if (callbacks.onError) {
        callbacks.onError(err);
      }
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }
}
