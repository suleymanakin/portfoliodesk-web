/**
 * scope.js — Tenant isolation helpers
 *
 * Kural:
 * - Admin: her yatırımcıya erişebilir.
 * - Investor: sadece kendi investorId'sine erişebilir.
 */

export function requireInvestorScopeFromParam(paramName = 'id') {
  return (req, res, next) => {
    if (req.user?.role === 'admin') return next();
    if (req.user?.role !== 'investor') {
      return res.status(403).json({ success: false, error: 'Bu işlem için yetkiniz yok.' });
    }
    const target = Number(req.params?.[paramName]);
    const selfId = Number(req.user?.investorId);
    if (!selfId || !target || target !== selfId) {
      return res.status(403).json({ success: false, error: 'Sadece kendi verinize erişebilirsiniz.' });
    }
    return next();
  };
}

export function requireInvestorScopeFromQuery(queryName = 'investorId') {
  return (req, res, next) => {
    if (req.user?.role === 'admin') return next();
    if (req.user?.role !== 'investor') {
      return res.status(403).json({ success: false, error: 'Bu işlem için yetkiniz yok.' });
    }
    const target = Number(req.query?.[queryName]);
    const selfId = Number(req.user?.investorId);
    if (!selfId) {
      return res.status(403).json({ success: false, error: 'Sadece kendi verinize erişebilirsiniz.' });
    }
    // Investor çağrısında investorId parametresi yoksa, otomatik self’e sabitlemek yerine 403 dönelim.
    // Böylece yanlış kullanım daha erken anlaşılır.
    if (!target || target !== selfId) {
      return res.status(403).json({ success: false, error: 'Sadece kendi verinize erişebilirsiniz.' });
    }
    return next();
  };
}

