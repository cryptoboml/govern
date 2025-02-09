import { Contract, utils, providers, BigNumberish, constants } from 'ethers'
import Configuration from '../internal/configuration/Configuration'
import { registerToken } from '../internal/actions/RegisterToken'

export const ContainerConfig = `
  tuple(
    uint256 executionDelay, 
    tuple(
      address token, 
      uint256 amount
    ) scheduleDeposit, 
    tuple(
      address token, 
      uint256 amount
    ) challengeDeposit, 
    address resolver, 
    bytes rules, 
    uint256 maxCalldataSize
  )`

const token = `
  tuple(
    address tokenAddress, 
    uint8 tokenDecimals, 
    string tokenName, 
    string tokenSymbol
  )`



const factoryAbi = [
  `function newGovern(
    string _name, 
    ${token} _token, 
    ${ContainerConfig} _config, 
    bool _useProxies
  )`,
]

const registryAbi = [
  "event Registered(address indexed executor, address queue, address indexed token, address indexed registrant, string name)"
]

const tokenAbi = [
  "function balanceOf(address who) view returns (uint256)"
]

declare let window: any

export type Token = {
  tokenAddress: string
  tokenDecimals: number
  tokenName: string
  tokenSymbol: string
}

export type TokenDeposit = {
  token: string
  amount: BigNumberish | string
}

export type DaoConfig = {
  executionDelay: number | string
  scheduleDeposit: TokenDeposit
  challengeDeposit: TokenDeposit
  resolver: string
  rules: utils.BytesLike
  maxCalldataSize: number
}

export type CreateDaoParams = {
  name: string
  token: Partial<Token>
  config: DaoConfig
  useProxies?: boolean
  useVocdoni?: boolean // not used yet
}

export type CreateDaoOptions = {
  provider?: any
  daoFactoryAddress?: string
}

/**
 * Create a Dao by the given name and token
 *
 * @param {args} parameters for DAO creation
 *
 * @param {options} options to overwrite with eip1193 provider and DAO factory address
 *
 * @returns {Promise<TransactionResponse>} transaction response object
 */
export async function createDao(
  args: CreateDaoParams,
  options: CreateDaoOptions = {},
  registerTokenCallback?: Function
): Promise<providers.TransactionResponse> {
  if (!args.token.tokenAddress) {
    args.token.tokenAddress = constants.AddressZero
  } else {
    args.token = {
      tokenDecimals: 18,
      tokenName: '',
      tokenSymbol: '',
      ...args.token,
    }
  }

  const addressIsZero = args.token.tokenAddress === constants.AddressZero
  const tokenIsMissingInfo = !args.token.tokenName || !args.token.tokenSymbol

  if (addressIsZero && tokenIsMissingInfo) {
    throw new Error('Missing token name and/or symbol')
  }

  const config = Configuration.get()
  const factoryAddress = options.daoFactoryAddress || config.daoFactoryAddress
  const signer = await new providers.Web3Provider(
    options.provider || window.ethereum
  ).getSigner()
  const contract = new Contract(factoryAddress, factoryAbi, signer)

  const GovernRegistry = new Contract(
    config.governRegistry,
    registryAbi,
    signer
  )

  if(typeof registerTokenCallback === 'function') {
    GovernRegistry.on('Registered', async (govern, queue, token, registrant, name) => {
      // not our DAO, wait for next one
      if( name !== args.name ) return

      const ERC20 = new Contract(token, tokenAbi, signer)
      registerTokenCallback(() =>  registerToken(signer, ERC20))
    })
  }

  const result = contract.newGovern(
    args.name,
    args.token,
    args.config,
    args.useProxies
  )

  return result
}
