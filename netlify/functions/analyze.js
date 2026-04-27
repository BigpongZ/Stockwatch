exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { prompt } = JSON.parse(event.body);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: {
            parts: [{ text: "You are a professional stock analyst. Be direct and always end with BUY / HOLD / SELL." }]
          }
        }),
      }
    );

    const data = await res.json();
    console.log("Gemini full response:", JSON.stringify(data));

    const result = data.candidates?.[0]?.content?.parts?.[0]?.text
      || data.error?.message
      || JSON.stringify(data);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ result }),
    };
  } catch (err) {
    console.log("Fetch error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ result: "Error: " + err.message })
    };
  }
};
