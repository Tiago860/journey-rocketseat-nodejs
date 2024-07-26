import { FastifyInstance } from "fastify"
import { ZodTypeProvider } from "fastify-type-provider-zod"
import nodemailer from "nodemailer"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { getMailClient } from "../lib/mail"
import { dayjs } from "../lib/dayjs"
import { env } from "../env"
import { ClientError } from "../errors/client-error"

export async function createTrip(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post("/trips", {
    schema: {
      body: z.object({
        destination: z.string().min(4),
        starts_at: z.coerce.date(),
        ends_at: z.coerce.date(),
        owner_name: z.string(),
        owner_email: z.string().email(),
        emails_to_invite: z.array(z.string().email())
      })
    }
  }, async (request) => {
    const { destination, starts_at, ends_at, owner_email, owner_name, emails_to_invite } = request.body

    if(dayjs(starts_at).isBefore(new Date())) {
      throw new ClientError("invalid trip start date")
    }

    if(dayjs(ends_at).isBefore(starts_at)) {
      throw new ClientError("invalid trip date end")
    }

    const trip = await prisma.trip.create({
      data: {
        destination,
        starts_at,
        ends_at,
        participants: {
          createMany: {
            data: [
              {
                name: owner_name,
                email: owner_email,
                is_confirmed: true,
                is_owner: true,
              },
              ...emails_to_invite.map(email => {
                return { email }
              })
            ]
          }
        }
      }
    })

    const formattedStartDate = dayjs(starts_at).format("LL")
    const formattedEndDate = dayjs(ends_at).format("LL")

    const confirmLink = `${env.API_BASE_URL}/trips/${trip.id}/confirm`

    const mail = await getMailClient()

    const message = await mail.sendMail({
      from: {
        name: "equipe plann.er",
        address: "oi@plann.er",
      },
      to: {
        name: owner_name,
        address: owner_email,
      },
      subject: `confirme sua viagem para ${destination} em ${formattedStartDate}`,
      html: `<div style="font-family: sans-serif; font-size: 16px; line-height: 1.6">
                <p>
                  voce solicitou a criacao de uma viagem para <strong>${destination}</strong> nas datas de <strong>${formattedStartDate} ate <strong>${formattedEndDate}</strong>
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

    
    return { tripId: trip.id }

  })
}
