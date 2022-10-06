import { Id, NullableId, Paginated, Params } from '@feathersjs/feathers'
import { SequelizeServiceOptions, Service } from 'feathers-sequelize'

import { ClientSetting as ClientSettingInterface } from '@xrengine/common/src/interfaces/ClientSetting'

import { Application } from '../../../declarations'

export type ClientSettingDataType = ClientSettingInterface

export class ClientSetting<T = ClientSettingDataType> extends Service<T> {
  app: Application

  constructor(options: Partial<SequelizeServiceOptions>, app: Application) {
    super(options)
    this.app = app
  }

  async find(params?: Params): Promise<T[] | Paginated<T>> {
    const clientSettings = (await super.find(params)) as any
    const data = clientSettings.data.map((el) => {
      let appSocialLinks = JSON.parse(el.appSocialLinks)
      let themeSettings = JSON.parse(el.themeSettings)
      let themeModes = JSON.parse(el.themeModes)

      if (typeof appSocialLinks === 'string') appSocialLinks = JSON.parse(appSocialLinks)
      if (typeof themeSettings === 'string') themeSettings = JSON.parse(themeSettings)
      if (typeof themeModes === 'string') themeModes = JSON.parse(themeModes)

      return {
        ...el,
        appSocialLinks: appSocialLinks,
        themeSettings: themeSettings,
        themeModes: themeModes
      }
    })

    return {
      total: clientSettings.total,
      limit: clientSettings.limit,
      skip: clientSettings.skip,
      data
    }
  }

  async get(id: Id, params?: Params): Promise<T> {
    const clientSettings = (await super.get(id, params)) as any
    let appSocialLinks = JSON.parse(clientSettings.appSocialLinks)
    let themeSettings = JSON.parse(clientSettings.themeSettings)
    let themeModes = JSON.parse(clientSettings.themeModes)

    if (typeof appSocialLinks === 'string') appSocialLinks = JSON.parse(appSocialLinks)
    if (typeof themeSettings === 'string') themeSettings = JSON.parse(themeSettings)
    if (typeof themeModes === 'string') themeModes = JSON.parse(themeModes)

    return {
      ...clientSettings,
      appSocialLinks: appSocialLinks,
      themeSettings: themeSettings,
      themeModes: themeModes
    }
  }

  async patch(id: NullableId, data: any, params?: Params): Promise<T | T[]> {
    return super.patch(id, data, params)
  }
}
