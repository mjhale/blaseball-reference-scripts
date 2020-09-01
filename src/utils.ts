import fetch from "@adobe/node-fetch-retry";

export async function fetchData(link: string): Promise<any> {
  const request = await fetch(link, {
    retryOptions: {
      retryMaxDuration: 300000,
      retryInitialDelay: 2000,
      retryOnHttpResponse: function (response) {
        if (response.status >= 500 || response.status >= 400) {
          return true;
        }
      },
      socketTimeout: 60000,
    },
  });
  const response = await request.json();
  return response;
}
