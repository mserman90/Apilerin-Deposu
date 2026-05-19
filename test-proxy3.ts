const testProxy3 = async () => {
    try {
        const response = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent('https://api.apideposu.com/catalog/apis?limit=500'));
        console.log(response.status, response.statusText);
        const data = await response.json();
        const parsed = JSON.parse(data.contents);
        console.log("Data is array:", Array.isArray(parsed));
        console.log("Length:", parsed.length);
    } catch(e) {
        console.error(e);
    }
}
testProxy3();
