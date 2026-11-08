import { z } from "zod";

// Общие схемы форм: клиент и сервер проверяют одно и то же; в БД те же ограничения — CHECK.
export const DatasetInput = z.object({
  name: z.string().trim().min(2, "Название — от 2 символов").max(120, "Название — до 120 символов"),
  description: z.string().trim().max(2000, "Описание — до 2000 символов").optional(),
});
