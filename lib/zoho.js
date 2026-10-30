
const accountsUrl =
    process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in";

const apiDomain =
    process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.in";

// Generate a fresh access token using the refresh token.
async function getZohoAccessToken() {
    const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    });

    const response = await fetch(
        `${accountsUrl}/oauth/v2/token`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
            cache: "no-store",
        }
    );

    const result = await response.json();

    if (!response.ok || !result.access_token) {
        throw new Error(
            `Zoho token refresh failed: ${result.error || response.status}`
        );
    }

    return result.access_token;
}

// Update the corresponding Zoho Deal.
export async function markZohoDealAsPaid(dealId) {
    if (!dealId) {
        throw new Error("Zoho Deal ID is missing.");
    }

    const fieldName =
        process.env.ZOHO_PAYMENT_STATUS_FIELD_API_NAME;

    if (!fieldName) {
        throw new Error("Zoho payment status field API name is missing.");
    }

    const accessToken = await getZohoAccessToken();

    const response = await fetch(
        `${apiDomain}/crm/v8/Deals/${encodeURIComponent(dealId)}`,
        {
            method: "PUT",
            headers: {
                Authorization: `Zoho-oauthtoken ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                data: [
                    {
                        [fieldName]: "Paid",
                    },
                ],
            }),
            cache: "no-store",
        }
    );

    const result = await response.json();

    console.log(
        "Zoho Deal update response:",
        JSON.stringify(result, null, 2)
    );

    const recordStatus = result.data?.[0]?.status;

    if (!response.ok || recordStatus !== "success") {
        throw new Error(
            `Zoho Deal update failed: ${result.data?.[0]?.message ||
            result.message ||
            response.status
            }`
        );
    }

    return result;
}

export async function getZohoDeal(dealId) {
    if (!dealId) {
        throw new Error("Zoho Deal ID is missing.");
    }

    const accessToken = await getZohoAccessToken();

    const response = await fetch(
        `${apiDomain}/crm/v8/Deals/${encodeURIComponent(dealId)}`,
        {
            method: "GET",
            headers: {
                Authorization: `Zoho-oauthtoken ${accessToken}`,
            },
            cache: "no-store",
        }
    );

    const result = await response.json();

    if (!response.ok || !result.data?.[0]) {
        throw new Error(
            `Zoho Deal fetch failed: ${JSON.stringify(result)}`
        );
    }

    return result.data[0];
}