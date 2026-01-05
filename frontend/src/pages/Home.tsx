import { useBackendHealth } from "../hooks/useBackendHealth";

export default function Home() {
  const backendStatus = useBackendHealth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      {backendStatus === "loading" && (
        <p className="text-gray-500 text-lg">Connecting to NutriMentor AI…</p>
      )}

      {backendStatus === "error" && (
        <p className="text-red-600 text-lg">
          Backend not reachable. Please start the server.
        </p>
      )}

      {backendStatus === "ok" && (
        <p className="text-green-600 text-lg">
          NutriMentor AI is ready 🚀
        </p>
      )}
    </div>
  );
}
