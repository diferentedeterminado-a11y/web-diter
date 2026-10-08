import { MercadoPagoConfig, Preference } from 'mercadopago';

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || '',
});

export async function POST(request) {
  try {
    const { title, price, name, email } = await request.json();

    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: [
          {
            title: title,
            quantity: 1,
            unit_price: Number(price),
            currency_id: 'ARS',
          },
        ],
        payer: {
          name: name,
          email: email,
        },
        back_urls: {
          success: 'https://grupo-diter.vercel.app?status=success',
          failure: 'https://grupo-diter.vercel.app?status=failure',
          pending: 'https://grupo-diter.vercel.app?status=pending',
        },
        auto_return: 'approved',
      },
    });

    return Response.json({ init_point: result.init_point });
  } catch (error) {
    console.error('Error al crear preferencia en MP:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}