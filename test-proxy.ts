const testProxy = async () => {
    try {
        const response = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://api.apideposu.com/catalog/apis?limit=500'));
        console.log(response.status, response.statusText);
        const data = await response.json();
        console.log("Data is array:", Array.isArray(data));
        console.log("Length:", data.length);
    } catch(e) {
        console.error(e);
    }
}
testProxy();
