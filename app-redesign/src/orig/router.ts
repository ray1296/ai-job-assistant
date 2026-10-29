export function useRouter() {
  return {
    push: (to: string) => { location.hash = String(to).replace(/^\//, ""); },
    replace: (to: string) => { location.hash = String(to).replace(/^\//, ""); },
    back: () => history.back(),
  };
}
export function useRoute() {
  const raw = location.hash.replace(/^#/, "");
  const [pathPart, queryPart] = raw.split("?");
  const parts = pathPart.split("/");
  const query: Record<string, string> = {};
  for (const kv of (queryPart || "").split("&")) {
    if (!kv) continue;
    const [k, v] = kv.split("=");
    query[decodeURIComponent(k)] = decodeURIComponent(v || "");
  }
  const id = parts[1] || "";
  return { params: { id, subjectId: id }, path: "/" + pathPart, query };
}
export default { push: (to: string) => { location.hash = String(to).replace(/^\//, ""); } };
