// Unofficial RSS feed generator for The Pueblo Chieftain
import { XMLBuilder } from 'fast-xml-parser'

async function extractArticleInfo(url, KV) {
  const raw = await fetch(url).then(r => r.text())
  const article = {
    link: url,
    title: raw.match(/\<title\>(.+)\<\/title\>/)[1],
    id: url.match(/\/\d+\/\d+\/\d+\/[^\/]*\/(\d+)\/*/)?.pop()
  }
  // await KV.put()
  return article
}

async function generateRSS (env) {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver' })
  const localNow = new Date(formatter.format(now))
  const thisYear = localNow.getFullYear()
  const thisMonth = localNow.toLocaleString('default', { month: 'long' })
  const thisDay = localNow.toLocaleString('default', { day: '2-digit' })

  const url = new URL(`https://www.chieftain.com/sitemap/${thisYear}/${thisMonth}/${thisDay}`)

  console.log('Fetching:', url.toString(), '\n\n')
  const todaysLinks = await fetch(url)
    .then(r => r.text())
    .then(r => r.match(/\/story\/news\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9\-]+\/\d+\//g)) || []

  const rss_obj = {
    rss: {
      '@_version': '2.0',
      channel: {
        title: 'The Pueblo Chieftain | Recent articles',
        description: 'Unofficial RSS feed for The Pueblo Chieftain, a news source in Pueblo, CO',
        link: 'https://www.chieftain.com',
        docs: 'https://github.com/rpgwaiter/chieftain-rss',
        // lastBuildDate:
        // pubDate:
        language: 'en',
        item: todaysLinks?.map(i => {
          const [, titleRaw, id] = i.match(/\/story\/news\/\d{4}\/\d{2}\/\d{2}\/([a-z0-9\-]+)\/(\d+)\//)
          const link = (new URL(`https://www.chieftain.com${i}`)).toString()


          

          return {
            title,
            description: 'TODO: Scrape the page',
            link,
            guid: link
            // pubDate:
          }
        })
      }
    }
  }

  const builder = new XMLBuilder({ format: true, ignoreAttributes: false })
  const xml = builder.build(rss_obj)
  return xml
}

export default {
  async fetch (request, env, ctx) {
    const xml = await generateRSS(env)

    return new Response(xml, {
      headers: {
        'Content-type': 'text/xml;charset=UTF-8'
      }
    })
  }
}
