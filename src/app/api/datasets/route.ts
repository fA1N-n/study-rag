import { body, pgFail, session } from "@/lib/api";
import { DatasetInput } from "@/lib/schemas";

export async function GET() {
  const s = await session();
  if (s instanceof Response) return s;
  const { data, error } = await s.sb.from("datasets").select("*").order("created_at");
  return error ? pgFail(error) : Response.json(data);
}

export async function POST(req: Request) {
  const s = await session();
  if (s instanceof Response) return s;
  const input = await body(req, DatasetInput);
  if (input instanceof Response) return input;
  const { data, error } = await s.sb.from("datasets").insert({ ...input, owner_id: s.user.id }).select().single();
  return error ? pgFail(error) : Response.json(data, { status: 201 });
}
