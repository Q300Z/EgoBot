export interface EventStreamOptions {
  streamUrl: string;
  lastEventId?: string | null;
  onOpen?: () => void;
  onProgress?: (payload: { chunk: string }, lastEventId?: string) => void;
  onCompleted?: (payload: { statistics: any }, lastEventId?: string) => void;
  onFailedJob?: (payload: { error: string }, lastEventId?: string) => void;
  onCancelled?: (payload: any, lastEventId?: string) => void;
  onError?: (error: string) => void;
  onFailed?: () => void;
  onUnauthorized?: () => void;
}

export function createEventStream(options: EventStreamOptions) {
  let eventSource: EventSource | null = null;
  let isClosed = false;
  let currentLastEventId = options.lastEventId || null;

  const open = () => {
    if (isClosed) return;

    let targetUrl = options.streamUrl;
    if (currentLastEventId) {
      const urlObj = new URL(targetUrl, window.location.origin);
      urlObj.searchParams.set("lastEventId", currentLastEventId);
      targetUrl = urlObj.toString();
    }

    eventSource = new EventSource(targetUrl);

    eventSource.onopen = () => {
      options.onOpen?.();
    };

    const handleEvent = (event: MessageEvent) => {
      if (event.lastEventId) {
        currentLastEventId = event.lastEventId;
      }
      try {
        const payload = JSON.parse(event.data);
        if (payload.kind === "token" || event.type === "job.progress") {
          options.onProgress?.(payload, currentLastEventId || undefined);
        } else if ((payload.kind === "stats" && payload.status === "COMPLETED") || event.type === "job.completed") {
          options.onCompleted?.(payload, currentLastEventId || undefined);
        } else if (payload.status === "FAILED" || event.type === "job.failed") {
          options.onFailedJob?.(payload, currentLastEventId || undefined);
        } else if (payload.status === "CANCELLED" || event.type === "job.cancelled") {
          options.onCancelled?.(payload, currentLastEventId || undefined);
        }
      } catch (err) {
        console.error("Failed to parse SSE payload", err);
      }
    };

    eventSource.onmessage = handleEvent;
    if (typeof eventSource.addEventListener === "function") {
      eventSource.addEventListener("job.progress", handleEvent);
      eventSource.addEventListener("job.completed", handleEvent);
      eventSource.addEventListener("job.failed", handleEvent);
      eventSource.addEventListener("job.cancelled", handleEvent);
    }

    eventSource.onerror = (err) => {
      options.onError?.("SSE Connection error");
      close();
      options.onFailed?.();
    };
  };

  const close = () => {
    isClosed = true;
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };

  open();

  return {
    close,
  };
}
