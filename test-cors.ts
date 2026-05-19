const testOptions = async () => {
    try {
        const response = await fetch('https://api.apideposu.com/catalog/apis?limit=500', {
            method: 'OPTIONS',
            headers: {
                'Origin': 'https://apilerin-deposu.vercel.app'
            }
        });
        console.log('CORS headers:', {
            'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
            'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
        });
    } catch(e) {
        console.error(e);
    }
}
testOptions();
