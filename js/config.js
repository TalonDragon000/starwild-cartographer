/** Community map settings.

These are the public project URL and the public anon-role key. They are meant
to ship in the client. Never put a service role key or secret key in this file.

Clear both strings to run from the static JSON only. The contributor controls
stay hidden, and the page does not load Supabase.

Magic-link sign-in returns to magicLinkRedirect. In Supabase Auth, the Site URL
and the Redirect URLs list must include that address.

See the README section "Community points".
*/

export const supabaseUrl = "https://avwbewbeyklpysfndxub.supabase.co";
export const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2d2Jld2JleWtscHlzZm5keHViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3NTI1NzQsImV4cCI6MjExMDMyODU3NH0.nUeHpDSYEZokrZh7qupNDe8gJgliK9C8jecz2rtIAq8";
export const magicLinkRedirect = "https://talondragon000.github.io/starwild-cartographer/";

export function contribConfigured(url = supabaseUrl, key = supabaseAnonKey) {
  return typeof url === "string" && url.trim() !== "" && typeof key === "string" && key.trim() !== "";
}
