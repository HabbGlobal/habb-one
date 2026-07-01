/**
 * Single switch that turns the entire Owner Portal on or off — at the route
 * level, at the API level, and at the middleware level. Used so that if a
 * security issue is discovered in production, we can disable it without a
 * code revert.
 *
 * Default: OFF. The portal is invisible unless explicitly enabled via env.
 * That keeps the foundation code in the tree while PR 1+ are still in flux.
 */

const TRUTHY = new Set(["true", "1", "yes", "on"]);

export function isOwnerPortalEnabled(): boolean {
  const raw = process.env.OWNER_PORTAL_ENABLED?.toLowerCase().trim();
  return raw ? TRUTHY.has(raw) : false;
}

/**
 * Convenience for route handlers / server components — return a 404-shape
 * response when the portal is off, so the surface isn't even probeable.
 */
export function ownerPortalDisabledResponse(): Response {
  return new Response("Not Found", { status: 404 });
}
