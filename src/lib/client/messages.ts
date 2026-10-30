import type { ClientErrorCode } from "./api";

export interface ErrorCopy {
  title: string;
  hint: string;
  /** ¿Tiene sentido reintentar el mismo link? */
  retry: boolean;
}

/** Mensajes humanos para cada código de error. */
export const ERROR_COPY: Record<ClientErrorCode, ErrorCopy> = {
  UNSUPPORTED_URL: {
    title: "Ese link no es de un video soportado",
    hint: "Funciona con videos de TikTok y de X. En la app tocá Compartir → Copiar enlace.",
    retry: false,
  },
  NOT_FOUND: {
    title: "No encontramos ese video",
    hint: "Puede ser privado, haber sido borrado o el link estar incompleto.",
    retry: true,
  },
  NO_VIDEO: {
    title: "Esa publicación no tiene video",
    hint: "Por ahora se bajan videos y GIFs: las fotos y los posts de solo texto no están soportados.",
    retry: false,
  },
  PROVIDER_ERROR: {
    title: "El servicio de descarga falló",
    hint: "No es tu link: el proveedor externo respondió con un error. Probá de nuevo en un rato.",
    retry: true,
  },
  RATE_LIMITED: {
    title: "Fueron muchos pedidos seguidos",
    hint: "Los servicios gratuitos limitan los pedidos por segundo. Esperá un momento y reintentá.",
    retry: true,
  },
  UNAUTHORIZED: {
    title: "La clave de acceso no es válida",
    hint: "Ingresala de nuevo para seguir.",
    retry: false,
  },
  TIMEOUT: {
    title: "El servicio tardó demasiado",
    hint: "Puede estar saturado. Reintentá en unos segundos.",
    retry: true,
  },
  INVALID_REQUEST: {
    title: "No pudimos leer ese link",
    hint: "Revisá que esté completo y probá de nuevo.",
    retry: false,
  },
  INTERNAL_ERROR: {
    title: "Algo salió mal de nuestro lado",
    hint: "Reintentá. Si sigue pasando, revisá los logs en Vercel.",
    retry: true,
  },
  NETWORK_ERROR: {
    title: "Sin conexión",
    hint: "Revisá tu internet y reintentá.",
    retry: true,
  },
};
