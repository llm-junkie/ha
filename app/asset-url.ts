/** Keep catalogue and model URLs under the deployed site, including Pages subpaths. */
export function assetUrl(path: string, base = import.meta.env.BASE_URL): string {
  return `${base}${path.replace(/^\/+/, '')}`;
}
