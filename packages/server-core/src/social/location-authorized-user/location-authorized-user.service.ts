// Initializes the `location-authorized-user` service on path `/location-authorized-user`
import { Application } from '../../../declarations'
import { LocationAuthorizedUser } from './location-authorized-user.class'
import locationAuthorizedUserDocs from './location-authorized-user.docs'
import hooks from './location-authorized-user.hooks'
import createModel from './location-authorized-user.model'

// Add this service to the service type index
declare module '@xrengine/common/declarations' {
  interface ServiceTypes {
    'location-authorized-user': LocationAuthorizedUser
  }
}

export default (app: Application) => {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate'),
    multi: true
  }

  /**
   * Initialize our service with any options it requires and docs
   */
  const event = new LocationAuthorizedUser(options, app)
  event.docs = locationAuthorizedUserDocs
  app.use('location-authorized-user', event)

  /**
   * Get our initialized service so that we can register hooks
   */
  const service = app.service('location-authorized-user')

  service.hooks(hooks)
}
