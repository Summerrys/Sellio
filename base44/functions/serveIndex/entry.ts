Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Read the index.html file
    const indexPath = './index.html';
    const indexContent = await Deno.readTextFile(indexPath);

    return new Response(indexContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Permissions-Policy': 'identity-credentials-get=(self "https://accounts.google.com")',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error serving index:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});