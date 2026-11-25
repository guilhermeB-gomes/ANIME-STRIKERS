import { Router, type NextFunction, type Request, type Response } from 'express';
import { roomCodeSchema } from '@strikers/shared';
import { DomainError } from '../errors';
import type { AuthService } from '../services/auth-service';
import type { GameService } from '../services/game-service';
import type { GameRepository } from '../repositories/types';
import type { GuestRecord } from '../types/state';

interface Deps {
  auth: AuthService;
  service: GameService;
  repo: GameRepository;
  guestRateLimit: (req: Request, res: Response, next: NextFunction) => void;
}

type AuthedRequest = Request & { guest?: GuestRecord };

const publicGuest = (g: GuestRecord) => ({ id: g.id, name: g.name, wins: g.wins, draws: g.draws, losses: g.losses });

export function createRouter({ auth, service, repo, guestRateLimit }: Deps): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', time: Date.now() });
  });

  router.post('/guests', guestRateLimit, (req, res, next) => {
    auth
      .createGuest((req.body as { name?: unknown } | undefined)?.name)
      .then(({ player, token }) => res.status(201).json({ player: publicGuest(player), token }))
      .catch(next);
  });

  const requireAuth = (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    auth
      .authenticate(token)
      .then((guest) => {
        if (!guest) throw new DomainError('UNAUTHENTICATED', 'Sessão inválida. Entre novamente.');
        req.guest = guest;
        next();
      })
      .catch(next);
  };

  router.get('/me', requireAuth, (req: AuthedRequest, res, next) => {
    const guest = req.guest as GuestRecord;
    auth
      .refresh(guest.id)
      .then(async (fresh) => {
        const history = await repo.getHistory(guest.id, 20);
        res.json({ player: publicGuest(fresh ?? guest), history });
      })
      .catch(next);
  });

  router.get('/rooms/:code', (req, res) => {
    const parsed = roomCodeSchema.safeParse(req.params.code);
    if (!parsed.success) throw new DomainError('INVALID_CODE', 'Código inválido.');
    const info = service.getRoomInfo(parsed.data);
    if (!info) throw new DomainError('ROOM_NOT_FOUND', 'Sala não encontrada.');
    res.json(info);
  });

  return router;
}
