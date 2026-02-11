/**
 * Tenant middleware — multi-tenant SaaS
 * Requires auth to run first so req.user is set.
 * Sets req.tenantId (and optionally req.tenant) for downstream routes.
 */

/**
 * Require that the authenticated user has a tenant (tenantId in JWT).
 * Call after authenticate. Sets req.tenantId = req.user.tenantId.
 */
function requireTenant(req, res, next) {
  const tenantId = req.user?.tenantId ?? req.user?.tenant_id;
  if (tenantId == null) {
    return res.status(403).json({ error: 'Tenant context required' });
  }
  req.tenantId = Number(tenantId);
  req.legacyDb = !!req.user?.legacyDb; // no tenants table (main DB) — routes skip tenant filter
  next();
}

/**
 * Optional: validate that a resource belongs to the current tenant.
 * @param {Function} resourceGetter - async () => ({ tenant_id }) or async () => null
 * Returns 403 if resource is null or resource.tenant_id !== req.user.tenantId.
 */
async function validateTenantResource(resourceGetter) {
  return async (req, res, next) => {
    try {
      const resource = await resourceGetter(req);
      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }
      const resourceTenantId = resource.tenant_id ?? resource.tenantId;
      const userTenantId = req.user?.tenantId ?? req.user?.tenant_id;
      if (resourceTenantId != null && Number(resourceTenantId) !== Number(userTenantId)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireTenant, validateTenantResource };
