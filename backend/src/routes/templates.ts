import { Router, Request, Response } from 'express';
import { PREBUILT_TEMPLATES } from '../data/templates';

const router = Router();

/**
 * GET /api/templates
 * Exposes pre-built agent templates to the frontend page.
 */
router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(PREBUILT_TEMPLATES);
  } catch (error: any) {
    console.error('Error serving agent templates:', error);
    res.status(500).json({ message: 'Server error retrieving agent templates', error: error.message });
  }
});

export default router;
