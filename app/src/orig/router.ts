export function useRouter() {
  return { push: (to: string) => { location.hash = String(to).replace(/^\//, ""); } };
}
