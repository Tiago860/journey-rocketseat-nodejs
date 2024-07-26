import { FastifyInstance } from "fastify"
import { ZodTypeProvider } from "fastify-type-provider-zod"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { dayjs } from "../lib/dayjs"
import { getMailClient } from "../lib/mail"
import nodemailer from "nodemailer"
import { env } from "../env"
import { ClientError } from "../errors/client-error"

export async function createInvite(app:FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/trips/:tripId/invites",
  {
    schema:{
      params: z.object({
        tripId: z.string().uuid()
      }),
      body: z.object({
        email: z.string().email()
      })
    }
  },
  async (request) => {
    const { tripId } = request.params
    const { email } = request.body

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
    })

    if(!trip) {
      throw new ClientError("Trip not found")
    }

    const participant = await prisma.participant.create({
      data: {
        email,
        trip_id: tripId
      }
    })
    const formattedStartDate = dayjs(trip.starts_at).format("LL")
    const formattedEndDate = dayjs(trip.ends_at).format("LL")

    const confirmLink = `${env.API_BASE_URL}/participants/${participant.id}/confirm`

    const mail = await getMailClient()

    const message = await mail.sendMail({
      from: {
        name: "equipe plann.er",
        address: "oi@plann.er",
      },
      to: participant.email,
      subject: `confirme sua presença na viagem para ${trip.destination} em ${formattedStartDate}`,
  html: `<div style="font-family: sans-serif; font-size: 16px; line-height: 1.6">
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
         </div>`.trim()
})
console.log(nodemailer.getTestMessageUrl(message))
    
return { participantId: participant.id}
  
  },
 )
}