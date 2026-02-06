import { Request, Response, NextFunction } from 'express';

export function bodyUnwrapper(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    if (req.body.body && typeof req.body.body === 'object') {
      req.body = req.body.body;
    } else if (req.body.body && typeof req.body.body === 'string') {
      try {
        req.body = JSON.parse(req.body.body);
      } catch {
        // leave as-is
      }
    }
  }
  next();
}
