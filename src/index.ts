// Unofficial RSS feed generator for The Pueblo Chieftain
import { XMLBuilder } from 'fast-xml-parser'
import type { KVNamespace, R2Bucket } from '@cloudflare/workers-types'

const extractArticleInfo = (raw) => ({
  title: raw.match(/<title>(.+)<\/title>/)[1],
  description: 'TODO: Scrape the page'
})

async function processLinks (linkArray, env) {
  const CHIEFTAIN_BUCKET: R2Bucket = env.CHIEFTAIN_BUCKET
  const CHIEFTAIN_KV: KVNamespace = env.CHIEFTAIN_KV

  return await Promise.all(
    linkArray?.map(async i => {
      const [, id] = i.match(/\/story\/[A-Za-z0-9-_\/]*\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]+\/([a-z0-9-]+)\//)
      const link = (new URL(`https://www.chieftain.com${i}`)).toString()

      // Try to get existing article from R2
      let thisArticleR2 = await CHIEFTAIN_BUCKET.get(id).then(async r => await r?.text())

      // Check if we already have this article in KV
      let thisArticleKV = await CHIEFTAIN_KV.get(`article:${id}`, 'json')

      // Save R2 (raw article) if we're missing that
      if (!thisArticleR2) {
        console.log(`No saved metadata for ${id}, putting one now`)
        thisArticleR2 = await fetch(link).then(async r => await r.text())

        // If we have an article at this point (we should unless something went very wrong)
        // Then put it into our bucket
        if (thisArticleR2) {
          await CHIEFTAIN_BUCKET.put(id, thisArticleR2)
        } else {
          // We still couldn't get an article read, so we return null out of this map
          console.error("we couldn't get an article, maybe we're rate limited or something..\n")
          return null
        }
      }

      // Save KV (metadata) if we're missing that
      if (!thisArticleKV) {
        console.log(`No metadata for ${id}, putting the article in kv`)
        const extracted = extractArticleInfo(thisArticleR2)

        // console.log(`extracted ${id}:`, extracted)

        thisArticleKV = {
          ...extracted,
          id,
          link,
          guid: link
        }
        await env.CHIEFTAIN_KV.put(`article:${id}`, JSON.stringify(thisArticleKV))
      }

      // One last sanity check to make sure we have everything
      // Before we return the article metadata
      if (thisArticleKV && thisArticleR2) {
        return thisArticleKV
      }
      console.log('final failsafe triggered for some reason:', id)
      return null
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

  console.log('\n', `=== Fetching Today's Articles: ${url.toString()} ===`, '\n\n')

  const todaysLinks: String[] | [] = await fetch(url)
    .then(async r => await r.text())
    .then(r => r.match(/\/story\/[A-Za-z0-9-_\/]*\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]+\/\d+\//g)) || []

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
