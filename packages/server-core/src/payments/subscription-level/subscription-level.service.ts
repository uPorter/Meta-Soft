import { Application } from '../../../declarations'
import { SubscriptionLevel } from './subscription-level.class'
import subscriptionLevelDocs from './subscription-level.docs'
import hooks from './subscription-level.hooks'
import createModel from './subscription-level.model'

declare module '@xrengine/common/declarations' {
  interface ServiceTypes {
    'subscription-level': SubscriptionLevel
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
  const event = new SubscriptionLevel(options, app)
  event.docs = subscriptionLevelDocs
  app.use('subscription-level', event)

  /**
   * Get our initialized service so that we can register hooks
   */
  const service = app.service('subscription-level')

  service.hooks(hooks)
}
