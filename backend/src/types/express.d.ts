declare global {
  namespace Express {
    interface Request {
      /** Attached by requireAuth middleware (AUTH-5). */
      user?: { id: string; username: string; role: string }
    }
  }
}

export {}