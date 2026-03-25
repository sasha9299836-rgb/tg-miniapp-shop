function parseErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const maybeStatus = (error as { context?: { status?: number }; status?: number }).context?.status
    ?? (error as { status?: number }).status;
  return typeof maybeStatus === "number" ? maybeStatus : null;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function isConnectionProblem(error: unknown): boolean {
  const message = readErrorMessage(error).toLowerCase();
  return message.includes("failed to fetch")
    || message.includes("network")
    || message.includes("networkerror")
    || message.includes("load failed")
    || message.includes("fetch failed");
}

export function getBatchShipmentSyncErrorMessage(error: unknown): string {
  const status = parseErrorStatus(error);
  if (status === 401) {
    return "Не удалось обновить статусы доставки: доступ запрещен. Войдите в админку заново.";
  }

  if (isConnectionProblem(error)) {
    return "Не удалось обновить статусы доставки: проблема с соединением.";
  }

  return "Не удалось обновить статусы доставки. Попробуйте еще раз.";
}

export function getAdminAnalyticsErrorMessage(error: unknown): string {
  const status = parseErrorStatus(error);
  if (status === 401) {
    return "Не удалось загрузить аналитику: доступ запрещен. Войдите в админку заново.";
  }

  if (isConnectionProblem(error)) {
    return "Не удалось загрузить аналитику: проблема с соединением.";
  }

  return "Не удалось загрузить аналитику. Попробуйте еще раз.";
}

export function getAdminActionErrorMessage(action: "confirm" | "reject" | "recover_lock" | "sync_order" | "copy_track", error: unknown): string {
  const status = parseErrorStatus(error);
  if (status === 401) {
    return "Доступ запрещен. Войдите в админку заново.";
  }

  if (isConnectionProblem(error)) {
    return "Проблема с соединением. Попробуйте еще раз.";
  }

  if (action === "confirm") {
    return "Не удалось подтвердить оплату. Попробуйте еще раз.";
  }
  if (action === "reject") {
    return "Не удалось отклонить оплату. Попробуйте еще раз.";
  }
  if (action === "recover_lock") {
    return "Не удалось снять блокировку отправления. Попробуйте еще раз.";
  }
  if (action === "sync_order") {
    return "Не удалось обновить статус доставки по заказу. Попробуйте еще раз.";
  }
  return "Не удалось скопировать номер отправления. Попробуйте еще раз.";
}
