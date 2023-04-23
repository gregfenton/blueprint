// @ts-nocheck
// file deepcode ignore AttrAccessOnNull: Everytime I see this, I think it's a false positive

// monorepo imports
import { errorResponseOut, requestIn, responseOut } from './content-processor.js'
import { throwIf, throwUnless } from './throws.js'
import { getDebug, Debug } from './debug.js'
import { callDO, hardDeleteDO, getTypeVersionConfigAndEnvironmentOptions } from './referenced-do-operations.js'

// initialize imports
const debug = getDebug('blueprint:people-lookup')

/*

## Key/metadata pairings

I'm using metadata rather than the value because the metadata comes back with the key when we do a list operation.
If you put it in the value, you have to do a get operation on each key to get the needed info. 1KB is supported in metatdata.

    1. key: `emailAddress/${emailAddress}`, metadata: { personIDString }
    2. key: `orgTree/${orgTreeIDString}`, metadata: { label, peopleCount }
    3. key: `orgTree/${orgTreeIDString}/${personIDString}`, metadata: { name }
       There will eventually be thousands of these. The idea is that adding a new one only adds one key and updates no others.
       To retrieve them we’ll use the list API function using a prefix option `orgTree/${orgTreeIDString}/`.
       I think we can just get them all for a given orgTreeIDString with no paging because 128MB should hold 100’s of thousands.
       The value is the name to save the lookup using key/metadata pair #4. This means we'll need to update both key/metadata pair #3 and #4 when the name changes.
    4. key: `person/${personIDString}/${orgTreeIDString}`, metadata: { label }
    5. key: `person/${personIDString}`, metadata: { name }

## Endpoints
    * PATCH personValue or personIDString, rootNodeValue or orgTreeIDString
        * Creates the Person DO and/or Org Tree DO if necessary. After that we'll have an personIDString and orgTreeIDString.
        * Error if the email is in use
        * Upserts key/metadata all key/metadata pairs
    * GET /email/{emailAddress}
        * Returns the { personIDString, name, orgTrees: { orgTreeIDString: { label } }
    * GET /org-tree/{orgTreeIDString}
        * Returns { label, people: { personIDString: name } }
    * GET /person/{personIDString}
        * Returns { name, orgTreeorgTrees: { orgTreeIDString: { label } }

## Queue consumers
    * updateFromPerson - body { person: everything returned by a GET }
        * update key/metadata pair #1: Calculate delta of emailAddresses array in the Person object
            * Set(Current) - Set(Previous) ==> Add these
            * Set(Previous) - Set(Current) ==> Remove these
        * update the name in metadata #5
            * Use personIDString to lookup and update metadata
        * update the name in metadata #3 for each orgTreeIDString
        * handle delete and undelete
    * updateFromOrgTree - body { orgTree: everything returned by GET }
        * update the label in key/metadata pairs #2 and #4
*/

const handlers = {

  // proerties on `this`

  env: null,
  context: null,
  personTypeVersionConfig: null,

  // Section: Handlers

  async patch(content) {
    const { personValue, rootNodeValue, userID, validFrom, impersonatorID } = content
    let { personIDString, orgTreeIDString } = content
    throwIf(personValue == null && personIDString == null, 'body.personValue or body.personIDString required', 400)
    throwIf(personValue != null && personIDString != null, 'Only one of body.personValue or body.personIDString allowed', 400)
    throwIf(rootNodeValue == null && orgTreeIDString == null, 'body.rootNodeValue or body.orgTreeIDString required', 400)
    throwIf(rootNodeValue != null && orgTreeIDString != null, 'Only one of body.rootNodeValue or body.orgTreeIDString allowed', 400)

    let name
    let createPersonResponse
    if (personValue != null) {  // Create a new Person
      const options = {
        method: 'POST',
        body: { value: personValue, userID: userID ?? 'self', validFrom, impersonatorID },  // TODO: Upgrade to allow use of 'self' for UserID
      }
      createPersonResponse = await callDO(this.env, this.personTypeVersionConfig, options, 201)
      personIDString = createPersonResponse.content.idString
      name = createPersonResponse.content.value.name
    } else {
      // TODO: Retrieve the Person DO
    }

    let label
    let createOrgTreeResponse
    if (rootNodeValue != null) {
      orgTreeIDString = ''  // TODO: Finish this
    } else {
      // TODO: Retrieve the OrgTree DO including the rootNode
      // TODO: Create a new endpoint on OrgTree get that just returns the Tree data and maybe rootNode. Maybe add a depth limit?
    }

    // TODO: If the OrgTree creation fails, delete the Person DO

    // TODO: Create the index entries in KV

    return [{ createPersonResponse: createPersonResponse.content }, 200]
  },

  async PATCH(request) {
  // throwIfMediaTypeHeaderInvalid(request)
    const { content } = await requestIn(request)
    const [responseBody, status] = await this.patch(content)
    return responseOut(responseBody, status)
  },

  async get(options) {
    const { statusToReturn = 200 } = options ?? {}
    const result = null
    return [result, statusToReturn]
  },

  async GET() {
    const [responseBody, status] = await this.get()
    return responseOut(responseBody, status)
  },

  async fetch(request, env, context, personTypeVersionConfig) {  // TODO: Use itty-router
    debug('fetch() called with %s %s', request.method, request.url)
    this.env = env
    this.context = context
    this.personTypeVersionConfig = personTypeVersionConfig

    this.warnings = []
    try {
      const url = new URL(request.url)
      const pathArray = url.pathname.split('/').filter((s) => s !== '')

      const restOfPath = `/${pathArray.join('/')}`
      switch (restOfPath) {
        case '/':
          if (handlers[request.method] != null) return await handlers[request.method](request)
          return throwIf(true, `Unrecognized HTTP method ${request.method} for ${url.pathname}`, 405)

        default:
          return throwIf(true, `Unrecognized URL ${url.pathname}`, 404)
      }
    } catch (e) {
      return errorResponseOut(e, this.env)  // TODO: What is this.env used for here?
    }
  },
}

export function getPersonLookupFetch(typeConfig, personType, personVersion) {
  const personTypeVersionConfig = getTypeVersionConfigAndEnvironmentOptions(personType, personVersion, typeConfig).typeVersionConfig
  return async (request, env, context) => handlers.fetch(request, env, context, personTypeVersionConfig)
}

export function getPersonLookupFetchPartialPartial(typeConfig, personType, personVersion) {
  const fetch = getPersonLookupFetch(typeConfig, personType, personVersion)
  return (env, context) => async (request) => fetch(request, env, context)
}
