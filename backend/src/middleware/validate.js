import { validationResult, body, param, query } from 'express-validator';

/**
 * Validation sonuçlarını kontrol edip hata döndüren middleware.
 * Route'lardaki validate() zincirinin sonunda kullanılır.
 */
export function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

// ---------------------------------------------------------------------------
// Yeniden kullanılabilir validator kuralları
// ---------------------------------------------------------------------------

/** YYYY-MM-DD formatında tarih */
export const isDate = (field) =>
  param(field)
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage(`${field}: YYYY-MM-DD formatında olmalıdır`);

/** Pozitif Decimal string (negatif yüzde kabul: günlük kayıp) */
export const isDecimalString = (field, opts = {}) => {
  const { allowNegative = false, required = true } = opts;
  const chain = required ? body(field).notEmpty().withMessage(`${field} zorunludur`) : body(field).optional();
  return chain
    .isNumeric({ no_symbols: allowNegative ? false : true })
    .withMessage(`${field}: geçerli bir sayı olmalıdır`);
};

/** Integer range */
export const isIntRange = (field, min, max) =>
  body(field)
    .isInt({ min, max })
    .withMessage(`${field}: ${min} ile ${max} arasında tamsayı olmalıdır`);

/** Yatırımcı ID parametresi */
export const investorIdParam = () =>
  param('id').isInt({ min: 1 }).withMessage('Geçerli bir yatırımcı ID giriniz');

/** Yıl parametresi */
export const yearParam = (field = 'year') =>
  param(field).isInt({ min: 2000, max: 2100 }).withMessage('Geçerli bir yıl giriniz');

/** Ay parametresi */
export const monthParam = (field = 'month') =>
  param(field).isInt({ min: 1, max: 12 }).withMessage('Ay 1-12 arasında olmalıdır');
