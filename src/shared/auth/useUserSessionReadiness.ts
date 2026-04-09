import { useEffect, useState } from "react";
import {
  isTgIdentityRequiredError,
  TG_IDENTITY_REQUIRED_ERROR,
  TG_IDENTITY_REQUIRED_MESSAGE,
} from "./tgUser";
import { ensureTelegramUserSessionToken } from "./tgUserSession";

type UserSessionReadinessState = {
  isReady: boolean;
  isChecking: boolean;
  errorText: string | null;
};

export function useUserSessionReadiness(): UserSessionReadinessState {
  const [isReady, setIsReady] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setIsChecking(true);
      setErrorText(null);
      try {
        const token = await ensureTelegramUserSessionToken();
        if (!token) {
          throw new Error(TG_IDENTITY_REQUIRED_ERROR);
        }
        if (!cancelled) {
          setIsReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          setIsReady(false);
          setErrorText(isTgIdentityRequiredError(error) ? TG_IDENTITY_REQUIRED_MESSAGE : "Не удалось подготовить пользовательскую сессию.");
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { isReady, isChecking, errorText };
}

export default useUserSessionReadiness;
