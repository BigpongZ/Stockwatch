exports.handler = async function (event) {
  const symbol = event.queryStringParameters?.symbol;
  if (!symbol) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing symbol" }) };
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
    });

    if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;

    if (!meta) throw new Error("No data");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        symbol,
        price: meta.regularMarketPrice,
        prev: meta.chartPreviousClose,
        currency: meta.currency,
        name: meta.shortName || symbol,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
