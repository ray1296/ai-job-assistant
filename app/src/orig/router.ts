export function useRouter() {
  return {
    push: (to: string) => { location.hash = String(to).replace(/^\//, ""); },
    replace: (to: string) => { location.hash = String(to).replace(/^\//, ""); },
    back: () => history.back(),
  };
}
export function useRoute() {
  const parts = location.hash.replace(/^#/, "").split("/");
  return { params: { id: parts[1] || "", subjectId: parts[1] || "" }, path: location.hash, query: {} };
}
export default { push: (to: string) => { location.hash = String(to).replace(/^\//, ""); } };
