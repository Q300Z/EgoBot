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

  async getAdminConversations(userId?: string) {
    const res = await this.api.get("/api/v1/admin/conversations", {
      params: userId ? { userId } : undefined,
    });
    return res.data;
  }

  async getAdminConversation(id: string) {
    const res = await this.api.get(`/api/v1/admin/conversations/${id}`);
    return res.data;
  }

  async getUserConversations(userId: string) {
    const res = await this.api.get(`/api/v1/admin/users/${userId}/conversations`);
    return res.data;
  }

  connectAdminConversationStream(
    conversationId: string,
    callbacks: {
      onToken?: (chunk: string, jobId?: string) => void;
      onStatus?: (status: string, jobId?: string) => void;
      onError?: (err: any) => void;
    }
  ): () => void {
    const streamUrl = `${this.api.defaults.baseURL}/sse/v1/admin/conversations/${conversationId}${this.token ? `?token=${this.token}` : ""}`;
    const eventSource = new EventSource(streamUrl);

    const handleEvent = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const eventType = data.type || data.kind || "unknown";
        const payload = data.payload || data;
        const jobId = payload.jobId || data.jobId || payload.job_id;

        if (eventType === "token" || data.kind === "token" || payload.kind === "token") {
          if (callbacks.onToken) {
            const chunk = payload.chunk || payload.data?.chunk || data.chunk || "";
            if (jobId !== undefined) {
              callbacks.onToken(chunk, jobId);
            } else {
              callbacks.onToken(chunk);
            }
          }
        }

        const status = data.status || payload.status;
        if (status) {
          if (callbacks.onStatus) {
            if (jobId !== undefined) {
              callbacks.onStatus(status, jobId);
            } else {
              callbacks.onStatus(status);
            }
          }
        }
      } catch {}
    };

    eventSource.onmessage = handleEvent;
    eventSource.addEventListener("job.progress", handleEvent);
    eventSource.addEventListener("job.completed", handleEvent);
    eventSource.addEventListener("token", handleEvent);
    eventSource.addEventListener("status", handleEvent);

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

    const handleEvent = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const eventType = data.type || data.kind || "unknown";
        const payload = data.payload || data;

        const isToken = eventType === "token" || data.kind === "token" || payload.kind === "token";
        const isStatus = Boolean(data.status || payload.status);
        const isStats = eventType === "statistics" || Boolean(payload.statistics || data.statistics);

        if (isToken) {
          if (callbacks.onToken) {
            callbacks.onToken(payload.chunk || payload.data?.chunk || data.chunk || "");
          }
        } else if (isStatus) {
          if (callbacks.onStatus) {
            callbacks.onStatus(data.status || payload.status, payload.error || data.error);
          }
        } else if (isStats) {
          if (callbacks.onStatistics) {
            callbacks.onStatistics(payload.statistics || data.statistics || payload);
          }
        } else {
          if (callbacks.onUnknownEvent) {
            callbacks.onUnknownEvent(eventType, payload);
          }
        }
      } catch (err) {}
    };

    eventSource.onmessage = handleEvent;
    eventSource.addEventListener("job.progress", handleEvent);
    eventSource.addEventListener("job.completed", handleEvent);
    eventSource.addEventListener("token", handleEvent);
    eventSource.addEventListener("status", handleEvent);

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
