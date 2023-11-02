// Unofficial RSS feed generator for The Pueblo Chieftain
import { XMLBuilder } from 'fast-xml-parser'
import type { KVNamespace, R2Bucket } from '@cloudflare/workers-types'

const extractArticleInfo = (raw) => ({
  title: raw.match(/\<title\>(.+)\<\/title\>/)[1],
  description: 'TODO: Scrape the page',
})

async function processLinks (linkArray, env) {
  const CHIEFTAIN_BUCKET: R2Bucket = env.CHIEFTAIN_BUCKET
  const CHIEFTAIN_KV: KVNamespace = env.CHIEFTAIN_KV

  return Promise.all(
    linkArray?.map(async i => {
      console.log('PROCESSING LINK:', i)

      const [, titleRaw, id] = i.match(/\/story\/[A-Za-z0-9\-\_\/]*\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9\-]+\/([a-z0-9\-]+)\//)
      const link = (new URL(`https://www.chieftain.com${i}`)).toString()

      let raw = await CHIEFTAIN_BUCKET.get(id).then(r => r?.text())
      let article = {
        link,
        guid: link
      }

      // Check if we already have this article in KV
      const existingArticleKV = await CHIEFTAIN_KV.get(`article:${id}`)

      // If we don't have the article saved in our bucket, let's do that
      if (!raw) {
        console.log('No r2 object, putting one now')
        raw = await fetch(link).then(r => r.text())

        raw && await CHIEFTAIN_BUCKET.put(id, raw)
      }

      // if we don't have metadata, lets generate that
      if (!existingArticleKV) {
        console.log('No metadata, putting the article in kv')
        article = {
          ...article,
          ...extractArticleInfo(raw)
        }
        await env.CHIEFTAIN_KV.put(`article:${id}`, JSON.stringify(article))
      }

      // TODO: check time and refresh, maybe keeping track of changes

      return article
    })
  )
}

async function generateRSS ({ env }) {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver' })
  const localNow = new Date(formatter.format(now))
  const thisYear = localNow.getFullYear()
  const thisMonth = localNow.toLocaleString('default', { month: 'long' })
  const thisDay = localNow.toLocaleString('default', { day: '2-digit' })

  const url = new URL(`https://www.chieftain.com/sitemap/${thisYear}/${thisMonth}/${thisDay}`)

  console.log('Fetching:', url.toString(), '\n\n')
  const todaysLinks: String[] | [] = await fetch(url)
    .then(r => r.text())
    .then(r => r.match(/\/story\/[A-Za-z0-9\-\_\/]*\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9\-]+\/\d+\//g)) || []

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
        item: await processLinks(todaysLinks, env)
      }
    }
  }

  const builder = new XMLBuilder({ format: true, ignoreAttributes: false })
  const xml = builder.build(rss_obj)
  return xml
}

export default {
  async fetch (request, env, ctx) {
    const xml = await generateRSS({ env })

    return new Response(xml, {
      headers: {
        'Content-type': 'text/xml;charset=UTF-8'
      }
    })
  }
}
