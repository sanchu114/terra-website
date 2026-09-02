const { Client, Environment } = require('square');
const { json, calendarClient } = require('./lib/booking');

const TEST_REQUEST_ID = 'terra-test-20260902-1015-01';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method Not Allowed' });
  if (process.env.CONTEXT !== 'deploy-preview') return json(403, { message: 'Deploy Preview only' });

  try {
    const data = JSON.parse(event.body || '{}');
    if (data.requestId !== TEST_REQUEST_ID) return json(403, { message: 'Invalid test request' });

    const calendar = await calendarClient();
    const calendarId = process.env.CAL_DIRECT_ID;
    const found = await calendar.events.list({
      calendarId,
      privateExtendedProperty: [`requestId=${TEST_REQUEST_ID}`],
      showDeleted: false,
      maxResults: 1,
    });
    const bookingEvent = found.data.items?.[0];
    if (!bookingEvent) return json(404, { message: 'Test booking was not found' });

    const properties = bookingEvent.extendedProperties?.private || {};
    const invoiceId = properties.invoiceId;
    if (!invoiceId) return json(409, { message: 'Test invoice ID was not found' });

    const squareToken = process.env.SQUARE_ACCESS_TOKEN;
    if (!squareToken) return json(500, { message: 'Square connection is missing' });
    const square = new Client({ accessToken: squareToken, environment: Environment.Production });

    const invoiceResponse = await square.invoicesApi.getInvoice(invoiceId);
    const invoice = invoiceResponse.result.invoice;
    if (invoice.status !== 'DRAFT') return json(409, { message: 'Test invoice is no longer a draft' });

    const customerId = invoice.primaryRecipient?.customerId;
    await square.invoicesApi.deleteInvoice(invoiceId, invoice.version);
    if (customerId) await square.customersApi.deleteCustomer(customerId);
    await calendar.events.delete({ calendarId, eventId: bookingEvent.id });

    return json(200, {
      status: 'deleted',
      invoiceDeleted: true,
      orderCanceled: true,
      customerDeleted: Boolean(customerId),
      calendarEventDeleted: true,
    });
  } catch (error) {
    console.error('Test Booking Cleanup Error:', error);
    return json(500, { message: 'テスト予約の削除中にエラーが発生しました。' });
  }
};
