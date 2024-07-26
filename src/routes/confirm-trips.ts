import { FastifyInstance } from "fastify"
import { ZodTypeProvider } from "fastify-type-provider-zod"
import { dayjs } from "../lib/dayjs"
import nodemailer from "nodemailer"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { getMailClient } from "../lib/mail"
import { env } from "../env"
import { ClientError } from "../errors/client-error"

export async function confirmTrip(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get("/trips/:tripId/confirm", {
    schema: {
      params: z.object({
        tripId: z.string().uuid(),
      })
    },
  }, async (request, reply) => {
    const { tripId } = request.params
    const trip = await prisma.trip.findUnique({
      where: {
        id: tripId,
      },
      include: {
        participants: {
          where: {
            is_owner: false
          }
        }
      }
    })

    if(!trip) {
      throw new ClientError("trip not found.")
    }

    if(trip.is_confirmed) {
      return reply.redirect(`${env.WEB_BASE_URL}/trips/${tripId}`)
    }

     await prisma.trip.update({
      where: { id: tripId },
      data: { is_confirmed: true}
    })

    const formattedStartDate = dayjs(trip.starts_at).format("LL")
    const formattedEndDate = dayjs(trip.ends_at).format("LL")
 
    const mail = await getMailClient()

    await Promise.all(
      trip.participants.map(async (participant) => {
        const confirmLink = `${env.API_BASE_URL}/participants/${participant.id}/confirm`

        const message = await mail.sendMail({
          from: {
            name: "equipe plann.er",
            address: "oi@plann.er",
          },
          to: participant.id,
          subject: `confirme sua presenca na viagem para ${trip.destination} em ${formattedStartDate}`,
          html: `
          <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6">
            <p>
              voce foi convidado para participar de uma viagem para <strong>${trip.destination}</strong> nas datas de <strong>${formattedStartDate} ate <strong>${formattedEndDate}</strong>
            </p>
            </p><p>
            <p>
              para confirmar sua viagem, clique no link abaixo:
            </p>
            <p>
              <a href="${confirmLink}">confirme sua viagem</a>
            </p>
            <p></p>
            <p>
              caso voce nao saiba do que se trata esse email, apenas ignore esse email.
            </p>
          </div>`.trim(),
        })
        console.log(nodemailer.getTestMessageUrl(message))
      })
    )

    return reply.redirect(`${env.WEB_BASE_URL}/trips/${tripId}`)
  })
}
