import { GigaDownApp } from "@/components/gigadown-app";
import { getServerEnv } from "@/lib/env";

export default function Home() {
  // Se evalúa al generar la página: cambiar ACCESS_KEY en Vercel requiere un redeploy.
  const authRequired = Boolean(getServerEnv().accessKey);
  return <GigaDownApp authRequired={authRequired} />;
}
