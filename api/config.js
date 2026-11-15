module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ configured: false, error: "Method not allowed" });
  }
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
  if (!supabaseUrl || !publishableKey) {
    return res.status(200).json({ configured: false, error: "Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to Vercel Environment Variables." });
  }
  return res.status(200).json({ configured: true, supabaseUrl, publishableKey });
};
