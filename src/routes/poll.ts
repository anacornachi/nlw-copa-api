import {FastifyInstance} from 'fastify';
import ShortUniqueId from 'short-unique-id';
import {z} from 'zod';
import {prisma} from '../lib/prisma';
import {authenticate} from '../plugins/authenticate';

export async function pollRoutes(fastify: FastifyInstance) {
  fastify.get('/polls/count', async (req, res) => {
    const count = await prisma.poll.count();

    return {count};
  });

  fastify.post('/polls', async (req, res) => {
    const createPollBody = z.object({
      title: z.string(),
    });

    const {title} = createPollBody.parse(req.body);

    const generate = new ShortUniqueId({length: 6});
    const code = String(generate()).toUpperCase();

    try {
      await req.jwtVerify();
      await prisma.poll.create({
        data: {
          title,
          code,
          ownerId: req.user.sub,

          participants: {
            create: {
              userId: req.user.sub,
            },
          },
        },
      });
    } catch (error) {
      await prisma.poll.create({
        data: {
          title,
          code,
        },
      });
    }

    res.status(201).send({code});
  });

  fastify.post(
    '/polls/join',
    {
      onRequest: [authenticate],
    },
    async (req, res) => {
      const joinPollBody = z.object({
        code: z.string(),
      });

      const {code} = joinPollBody.parse(req.body);

      const poll = await prisma.poll.findUnique({
        where: {
          code,
        },
        include: {
          participants: {
            where: {
              userId: req.user.sub,
            },
          },
        },
      });

      if (!poll) {
        return res.status(400).send({
          message: 'Poll not found',
        });
      }

      if (poll.participants.length > 0) {
        return res.status(400).send({
          message: 'You have already joined this poll',
        });
      }

      if (!poll.ownerId) {
        await prisma.poll.update({
          where: {
            id: poll.id,
          },
          data: {
            ownerId: req.user.sub,
          },
        });
      }

      await prisma.participant.create({
        data: {
          pollId: poll.id,
          userId: req.user.sub,
        },
      });

      return res.status(200).send();
    }
  );

  fastify.get(
    '/polls',
    {
      onRequest: [authenticate],
    },
    async (req, res) => {
      const polls = await prisma.poll.findMany({
        where: {
          participants: {
            some: {
              userId: req.user.sub,
            },
          },
          ownerId: req.user.sub,
        },
        include: {
          _count: {
            select: {
              participants: true,
            },
          },
          participants: {
            select: {
              id: true,

              user: {
                select: {
                  avatarUrl: true,
                },
              },
            },
            take: 4,
          },
          owner: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
      return {polls};
    }
  );

  fastify.get(
    '/polls/:id',
    {
      onRequest: [authenticate],
    },
    async (req, res) => {
      const getPoolParams = z.object({
        id: z.string(),
      });

      const {id} = getPoolParams.parse(req.params);

      const poll = await prisma.poll.findUnique({
        where: {
          id,
        },
        include: {
          _count: {
            select: {
              participants: true,
            },
          },
          participants: {
            select: {
              id: true,

              user: {
                select: {
                  avatarUrl: true,
                },
              },
            },
            take: 4,
          },
          owner: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return {poll};
    }
  );
}
