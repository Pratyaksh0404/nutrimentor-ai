import { useEffect, useState } from "react";
import { BACKEND_URL } from "../api/config";

export function useBackendHealth() {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    fetch(`${BACKEND_URL}/health`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(() => setStatus("ok"))
      .catch(() => setStatus("error"));
  }, []);

  return status;
}
