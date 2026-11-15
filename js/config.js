/** Community map settings.

Leave both strings empty to run the site from the static JSON only. The
contributor controls stay hidden, and the page does not load Supabase.

When both are set, the map can sign a visitor in with an email magic link and
accept new points. Use the project URL and the public anon key, or the newer
publishable key. Never put the service role key or secret key in this file.
The file is served with the site.

See the README section "Community points".
*/

export const supabaseUrl = "";
export const supabaseAnonKey = "";

export function contribConfigured(url = supabaseUrl, key = supabaseAnonKey) {
  return typeof url === "string" && url.trim() !== "" && typeof key === "string" && key.trim() !== "";
}
