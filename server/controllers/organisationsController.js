/**
 * JusticeNow — Legal resource directory controller.
 *
 * Thin request/response orchestration over organisationService.
 *
 * `list` and `getOne` are PUBLIC and UNAUTHENTICATED (reporters never log in),
 * and expose only active organisations with their public columns.
 *
 * `listAll`, `create`, `update` and `deactivate` are ADMIN-ONLY (guarded at the
 * route by requireStaff + requireRole('admin') — see routes/organisations.js and
 * CLAUDE.md's authorization matrix: "Manage organisations and staff" is admin).
 * Each mutation writes exactly one audit row. Org rows are public, so there is no
 * anonymity concern about their content — but we keep audit `detail` minimal and
 * consistent all the same.
 */

const {
  listOrganisations,
  getOrganisationById,
  listAllOrganisations,
  createOrganisation,
  updateOrganisation,
  deactivateOrganisation,
} = require('../services/organisationService');
const { writeAudit } = require('../services/audit');

/**
 * GET /api/organisations — list active organisations.
 * Optional query filters: ?district=...&case_type=...
 */
async function list(req, res) {
  try {
    // Map the snake_case query param to the service's camelCase argument, the
    // same way fetchReports maps caseType -> case_type on the wire.
    const data = await listOrganisations({
      district: req.query.district,
      caseType: req.query.case_type,
    });

    return res.json({ success: true, data });
  } catch (err) {
    // A bad filter is a client error (400 with the helpful message from the
    // service); anything else is a server problem (500, no internals leaked).
    if (err.status === 400) {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error('Unexpected error listing organisations:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Could not load the directory. Please try again.',
    });
  }
}

/**
 * GET /api/organisations/:id — one active organisation's public detail.
 * Not found or inactive → generic 404 (no distinction, no internals).
 */
async function getOne(req, res) {
  try {
    const org = await getOrganisationById(req.params.id);

    if (!org) {
      return res.status(404).json({
        success: false,
        message: 'Organisation not found.',
      });
    }

    return res.json({ success: true, data: org });
  } catch (err) {
    console.error('Unexpected error fetching organisation:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Could not load the organisation. Please try again.',
    });
  }
}

/**
 * Map a service error to an HTTP response. ValidationError -> 400,
 * NotFoundError -> 404; anything else is an unexpected server error -> 500.
 * Never leaks stack traces or DB text (mirrors reportsController).
 */
function respondServiceError(res, err, fallbackMessage) {
  if (err && typeof err.status === 'number') {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  console.error(fallbackMessage, err && err.message);
  return res.status(500).json({ success: false, message: fallbackMessage });
}

/**
 * GET /api/organisations/all — ADMIN list of ALL orgs (active + inactive).
 * Guarded by requireStaff + requireRole('admin') at the route.
 */
async function listAll(req, res) {
  try {
    const data = await listAllOrganisations();
    return res.json({ success: true, data });
  } catch (err) {
    return respondServiceError(
      res,
      err,
      'Could not load organisations. Please try again.',
    );
  }
}

/**
 * POST /api/organisations — ADMIN create.
 * AUDIT: org_created with { organisation_id, name } — non-sensitive metadata.
 */
async function create(req, res) {
  try {
    const org = await createOrganisation(req.body);

    await writeAudit({
      actorId: req.staff.id,
      action: 'org_created',
      detail: { organisation_id: org.id, name: org.name },
    });

    return res.status(201).json({ success: true, data: org });
  } catch (err) {
    return respondServiceError(
      res,
      err,
      'Could not create the organisation. Please try again.',
    );
  }
}

/**
 * PUT /api/organisations/:id — ADMIN update (partial; may toggle is_active).
 * AUDIT: org_updated with { organisation_id } — minimal metadata.
 */
async function update(req, res) {
  try {
    const org = await updateOrganisation(req.params.id, req.body);

    await writeAudit({
      actorId: req.staff.id,
      action: 'org_updated',
      detail: { organisation_id: org.id },
    });

    return res.json({ success: true, data: org });
  } catch (err) {
    return respondServiceError(
      res,
      err,
      'Could not update the organisation. Please try again.',
    );
  }
}

/**
 * DELETE /api/organisations/:id — ADMIN SOFT-delete (deactivate).
 *
 * The service NEVER issues a DB DELETE — that would cascade-delete the org's
 * staff_users (see organisationService.deactivateOrganisation). It flips
 * is_active to false instead. AUDIT: org_deleted with { organisation_id }.
 */
async function deactivate(req, res) {
  try {
    const org = await deactivateOrganisation(req.params.id);

    await writeAudit({
      actorId: req.staff.id,
      action: 'org_deleted',
      detail: { organisation_id: org.id },
    });

    return res.json({ success: true, data: org });
  } catch (err) {
    return respondServiceError(
      res,
      err,
      'Could not deactivate the organisation. Please try again.',
    );
  }
}

module.exports = { list, getOne, listAll, create, update, deactivate };
