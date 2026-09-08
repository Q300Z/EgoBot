import axios, { type AxiosInstance } from "axios";
import { type SourceData, type SourceType, SourceTypeEnum } from "@egobot/shared-types";

export type { SourceData, SourceType };
export { SourceTypeEnum };

export interface EgobotSDKConfig {
  baseUrl: string;
  token?: string;
}

export class EgobotClientSDK {
  private api: AxiosInstance;
  private token?: string;

  constructor(config: EgobotSDKConfig) {
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
  async login(emailOrUsername: string, password: string) {
    const isEmail = emailOrUsername.includes("@");
    const payload = isEmail
      ? { email: emailOrUsername, password }
      : { username: emailOrUsername, password };
    const res = await this.api.post("/api/v1/auth/login", payload);
    const data = res.data?.data ?? res.data;
    if (data?.token) {
      this.setToken(data.token);
    }
    return data; // { token, user }
  }

  async register(email: string, password: string, role?: string, username?: string) {
    const payload: Record<string, any> = { email, password };
    if (role) payload.role = role;
    if (username) payload.username = username;
    const res = await this.api.post("/api/v1/auth/register", payload);
    const data = res.data?.data ?? res.data;
    if (data?.token) {
      this.setToken(data.token);
    }
    return data; // { token, user }
  }

  async getMe() {
    const res = await this.api.get("/api/v1/auth/me");
    return res.data?.data ?? res.data; // user object direct
  }

  // Messages & Conversations REST Direct Standard
  async createMessage(prompt: string, conversationId?: string, model?: string) {
    const res = await this.api.post("/api/v1/messages", {
      prompt,
      conversation_id: conversationId,
      model,
    });
    return res.data?.data ?? res.data; // { job_id, conversation_id, stream_url }
  }

  async cancelMessage(jobId: string) {
    const res = await this.api.post(`/api/v1/messages/${jobId}/cancel`);
    return res.data?.data ?? res.data;
  }

  async getConversations() {
    const res = await this.api.get("/api/v1/conversations");
    return res.data?.data ?? res.data; // array [ conversation1, conversation2 ]
  }

  async getConversation(id: string) {
    const res = await this.api.get(`/api/v1/conversations/${id}`);
    return res.data?.data ?? res.data; // conversation object
  }

  async deleteConversation(id: string) {
    const res = await this.api.delete(`/api/v1/conversations/${id}`);
    return res.data?.data ?? res.data;
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
      onSource?: (source: any, jobId?: string) => void;
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

        const isSource =
          eventType === "source" ||
          data.kind === "source" ||
          payload.kind === "source" ||
          Boolean(payload.source || data.source);

        if (isSource) {
          const sourceData = payload.source || data.source;
          const chunk =
            payload.chunk || payload.data?.chunk || data.chunk || (sourceData ? `[[source:${JSON.stringify(sourceData)}]]` : "");
          if (callbacks.onSource && sourceData) {
            callbacks.onSource(sourceData, jobId);
          }
          if (callbacks.onToken && chunk) {
            if (jobId !== undefined) {
              callbacks.onToken(chunk, jobId);
            } else {
              callbacks.onToken(chunk);
            }
          }
        } else if (eventType === "token" || data.kind === "token" || payload.kind === "token") {
          const chunk = payload.chunk || payload.data?.chunk || data.chunk || "";
          if (chunk.includes("[[source:")) {
            const match = chunk.match(/\[\[source:(\{[\s\S]*?\})\]\]/);
            if (match) {
              try {
                const inlineSource = JSON.parse(match[1]);
                if (callbacks.onSource) {
                  callbacks.onSource(inlineSource, jobId);
                }
              } catch {}
            }
          }
          if (callbacks.onToken) {
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
    if (typeof eventSource.addEventListener === "function") {
      eventSource.addEventListener("job.progress", handleEvent);
      eventSource.addEventListener("job.completed", handleEvent);
      eventSource.addEventListener("job.cancelled", handleEvent);
      eventSource.addEventListener("job.failed", handleEvent);
      eventSource.addEventListener("token", handleEvent);
      eventSource.addEventListener("source", handleEvent);
      eventSource.addEventListener("status", handleEvent);
    }

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
      onSource?: (source: SourceData | any) => void;
      onStatus?: (status: string, error?: string) => void;
      onStatistics?: (stats: any) => void;
      onUnknownEvent?: (type: string, payload: any) => void;
      onError?: (err: any) => void;
    }
  ): () => void {
    // EventSource n'accepte pas d'en-tête : le jeton passe par la query string,
    // comme pour connectAdminConversationStream. Sans lui, l'API répond 401 —
    // le flux d'un job n'est plus accessible du seul fait d'en connaître l'id.
    const streamUrl = `${this.api.defaults.baseURL}/sse/${jobId}${this.token ? `?token=${encodeURIComponent(this.token)}` : ""}`;
    const eventSource = new EventSource(streamUrl);

    const handleEvent = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const eventType = data.type || data.kind || "unknown";
        const payload = data.payload || data;

        const isSource =
          eventType === "source" ||
          data.kind === "source" ||
          payload.kind === "source" ||
          Boolean(payload.source || data.source);
        const isToken = eventType === "token" || data.kind === "token" || payload.kind === "token";
        const isStatus = Boolean(data.status || payload.status);
        const isStats = eventType === "statistics" || Boolean(payload.statistics || data.statistics);

        if (isSource) {
          const sourceData = payload.source || data.source;
          const chunk =
            payload.chunk || payload.data?.chunk || data.chunk || (sourceData ? `[[source:${JSON.stringify(sourceData)}]]` : "");
          if (callbacks.onSource && sourceData) {
            callbacks.onSource(sourceData);
          }
          if (callbacks.onToken && chunk) {
            callbacks.onToken(chunk);
          }
        } else if (isToken) {
          const chunk = payload.chunk || payload.data?.chunk || data.chunk || "";
          if (chunk.includes("[[source:")) {
            const match = chunk.match(/\[\[source:(\{[\s\S]*?\})\]\]/);
            if (match) {
              try {
                const inlineSource = JSON.parse(match[1]);
                if (callbacks.onSource) {
                  callbacks.onSource(inlineSource);
                }
              } catch {}
            }
          }
          if (callbacks.onToken) {
            callbacks.onToken(chunk);
          }
        } else if (isStatus) {
          const status = data.status || payload.status;
          if (callbacks.onStatus) {
            callbacks.onStatus(status, payload.error || data.error);
          }
          if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
            eventSource.close();
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
    if (typeof eventSource.addEventListener === "function") {
      eventSource.addEventListener("job.progress", handleEvent);
      eventSource.addEventListener("job.completed", handleEvent);
      eventSource.addEventListener("job.cancelled", handleEvent);
      eventSource.addEventListener("job.failed", handleEvent);
      eventSource.addEventListener("token", handleEvent);
      eventSource.addEventListener("source", handleEvent);
      eventSource.addEventListener("status", handleEvent);
    }

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
