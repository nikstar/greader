var WebApp = window.Telegram.WebApp;

const hash = new URLSearchParams(window.location.search).get("hash")
if (!hash || hash.length == 0) {
    document.body.innerText = "403 Unauthorized: hash parameter not set"
    console.log("unautorized: ${window.location}")
}
const baseUrl = `https://greader.nikstar.me/api/${hash}`

const loadCount = async () => {
    try {
        const response = await fetch(baseUrl + "/subscriptions/count")
        const body = await response.json()
        const count = body.count
        const s = (count == 1) ? "" : "s"
        const container = document.getElementById("subs-count-info");
        container.innerHTML = `
            ${count} subscription${s}
        `
        container.hidden = (count === undefined)
    } catch (error) {
        console.log(`error fetching count: ${error}`)
        document.getElementById("subs-count-info").hidden = true
    }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const unsubscribe = async (id) => {
    try {
        console.log(`unsubscribe id: ${id}`)
        // await sleep(5000)
        await fetch(baseUrl + `/unsubscribe/${id}`)

    } catch (error) {
        console.error(`unsubscribe error: ${error}`)
    }
}

const resubscribe = async (id) => {
    try {
        console.log(`resubscribe id: ${id}`)
        // await sleep(5000)
        await fetch(baseUrl + `/resubscribe/${id}`)
    } catch (error) {
        console.log(`resubscribe error: ${error}`)
    }
}

const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
})
  

const unsubSvg = `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0z" fill="none"/><path d="M7 11v2h10v-2H7zm5-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>`
const resubSvg = `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0z" fill="none"/><path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>`

const DIVISIONS = [
    { amount: 60, name: "seconds" },
    { amount: 60, name: "minutes" },
    { amount: 24, name: "hours" },
    { amount: 7, name: "days" },
    { amount: 4.34524, name: "weeks" },
    { amount: 12, name: "months" },
    { amount: Number.POSITIVE_INFINITY, name: "years" },
]

function formatTimeAgo(dateString) {
    const date = new Date(dateString)
    let duration = (date - new Date()) / 1000

    for (let i = 0; i < DIVISIONS.length; i++) {
        const division = DIVISIONS[i]
        if (Math.abs(duration) < division.amount) {
        return formatter.format(Math.round(duration), division.name)
        }
        duration /= division.amount
    }
}

const loadSubscriptions = async () => {
    try {
        const response = await fetch(baseUrl + "/subscriptions/active")
        const body = await response.json()
        const subscriptions = body.subscriptions

        const search = document.getElementById("search")
        search.hidden = false

        const container = document.getElementById("list");
        container.innerHTML = ""
        container.hidden = false
        
        subscriptions.forEach(sub => {
            
            console.log(JSON.stringify(sub))
            const id = sub.id
            const tagId = `item-${id}`
            
            const div = document.createElement("div")
            div.className = "listitem"
            div.id = tagId
            div.innerHTML = `
                <div class="info">
                    <div class="itemname">
                        ${sub.title}
                    </div>
                    <a target="_blank" href="${sub.url}" class="itemlink">
                        ${sub.url}
                    </a>
                    <div class="dates"> 
                        <div> Most recent ${formatTimeAgo(sub.most_recent_item)} </div>
                        <div> Sent ${formatTimeAgo(sub.last_sent)} </div>
                        <div> Checked ${formatTimeAgo(sub.last_update_time)} </div>
                    </div>
                </div>
            `   

            const button = document.createElement("button")
            button.className = "itemsub"
            button.innerHTML = `
                ${unsubSvg}
                <div> Unsubscribe </div>
            `
            button.onclick = async () => {
                const currentText = button.getElementsByTagName("div")[0].innerText
                if (currentText == "Unsubscribe") {
                    await unsubscribe(id)
                    const div = document.getElementById(tagId)
                    div.classList.add("unsub")
                    button.innerHTML = `
                        ${resubSvg}
                        <div> Resubscribe </div>
                    `
                } else {
                    await resubscribe(id)
                    const div = document.getElementById(tagId)
                    div.classList.remove("unsub")
                    button.innerHTML = `
                        ${unsubSvg}
                        <div> Unsubscribe </div>
                    `
                }
            }

            div.appendChild(button)
            container.appendChild(div)
        })
    } catch (error) {
        console.error(`error fetching items: ${error}`)
        document.getElementById("list").innerHTML = ""
    }
}

const setUserpic = async () => {
    
    const userpic = document.getElementById("userpic")
    const url = WebApp.initDataUnsafe.user?.photo_url
    if (url) {
        userpic.src = url
        userpic.hidden = false
    } else {
        userpic.hidden = true
    }

    // debug
    // var e2 = document.createElement("p")
    // e2.innerText = JSON.stringify(window.Telegram, null, 4)
    // document.body.appendChild(e2)
}


async function searchCallback() {
    const search = document.getElementById("search")
    const query = search.value.trim().toLowerCase() 
    const listItems = Array.from(document.getElementsByClassName("listitem"))
    if (query.length == 0) {
        listItems.forEach(item => {
            item.hidden = false
        })
    } else {
        listItems.forEach(item => {
            const text = item.innerText.toLowerCase()
            console.log(`${text} ${item} ${!text.includes(query)}`)
            item.hidden = !text.includes(query)
        })
    }
}

async function watchSearch() {
    const search = document.getElementById("search")
    search.onchange = searchCallback
    search.oninput = searchCallback
    search.onkeydown = searchCallback
    search.onmousedown = searchCallback
}

(async () => {
    loadCount()
    loadSubscriptions()
    setUserpic()
    watchSearch()
})();   