'use babel'
import React from 'react'
import pull from 'pull-stream'
import app from '../lib/app'
import u from '../lib/util'
import social from '../lib/social-graph'
import { UserLink, NiceDate, VerticalFilledContainer } from '../com/index'
import { PromptModalBtn, InviteModalBtn } from '../com/modals'

class Peer extends React.Component {
  render() {
    let peer = this.props.peer

    // status: connection progress or last-connect info
    let status = ''
    if (peer.connected) {
      if (!peer.progress)
        status = <div className="light">Syncing</div>
      else if (peer.progress.sync || peer.progress.total === 0)
        status = <div className="light">Syncing</div>
      else
        status = <div className="light"><progress value={peer.progress.current / peer.progress.total} /></div>
    } else if (peer.time) {
      if (peer.time.connect > peer.time.attempt)
        status = <div className="light">Synced at <NiceDate ts={peer.time.connect} /></div>
      else if (peer.time.attempt) {
        status = <div className="light">Connect failed at <NiceDate ts={peer.time.attempt} /></div>
      }
    }

    return <div className={'peer flex '+((peer.connected)?'.connected':'')}>
      <div className="flex-fill">
        <div><UserLink id={peer.key} /> { social.follows(peer.key, app.user.id) ? <span className="light">Follows You</span> : '' }</div>
        <div><small>{peer.host}:{peer.port}:{peer.key}</small></div>
      </div>
      {status}
    </div>
  }
}

export default class Sync extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      peers: [],
      stats: {},
      isWifiMode: app.isWifiMode
    }
    this.onAppUpdate = () => {
      this.setState({ isWifiMode: app.isWifiMode })
    }
  }

  componentDidMount() {
    // setup app listeners
    app.on('update:all', this.onAppUpdate)
    app.on('update:isWifiMode', this.onAppUpdate)

    // fetch peers list
    app.ssb.gossip.peers((err, peers) => {
      if (err) return app.minorIssue('Failed to fetch peers list', err, 'This happened while loading the sync page')
      peers = peers || []
      this.setState({
        peers: peers,
        stats: u.getPubStats(peers)
      })
    })

    // setup event streams
    pull((this.gossipChangeStream = app.ssb.gossip.changes()), pull.drain(this.onGossipEvent.bind(this)))
    pull((this.replicateChangeStream = app.ssb.replicate.changes()), pull.drain(this.onReplicationEvent.bind(this)))
  }
  componentWillUnmount() {
    // abort streams and listeners
    app.removeListener('update:all', this.onAppUpdate)
    app.removeListener('update:isWifiMode', this.onAppUpdate)
    this.gossipChangeStream(true, ()=>{})
    this.replicateChangeStream(true, ()=>{})
  }

  onGossipEvent(e) {
    // update the peers
    let i, peers = this.state.peers
    for (i=0; i < peers.length; i++) {
      if (peers[i].key == e.peer.key && peers[i].host == e.peer.host && peers[i].port == e.peer.port) {
        peers[i] = e.peer
        break
      }
    }
    if (i == peers.length)
      peers.push(e.peer)
    this.setState({ peers: peers, stats: u.getPubStats(peers) })
  }
  onReplicationEvent(e) {
    // update the peers
    let progress = { feeds: e.feeds, sync: e.sync, current: e.progress, total: e.total }
    let i, peers = this.state.peers
    for (i=0; i < peers.length; i++) {
      if (peers[i].key == e.peerid) {
        peers[i].progress = progress
        break
      }
    }

    // update observables
    if (i !== peers.length)
      this.setState({ peers: peers })
  }
  onUseInvite() {
    this.props.history.pushState(null, '/')
  }
  
  // TODO needed?
  /*onAddNode(addr) {
    app.ssb.gossip.connect(addr, function (err) {
      if (err)
        app.issue('Failed to connect to '+addr, err)
    })
  }*/

  render() {
    const stats = this.state.stats
    
    return <VerticalFilledContainer id="sync">
      <div className="header">
        { this.state.isWifiMode ?
          <div>
            <h1><i className="fa fa-wifi" /> WiFi Mode</h1>
            <h3>{"You're not connected to any Pubs, but you can still connect to peers on your Local Area Network."}</h3>
          </div> :
          <div>
            <h1><i className="fa fa-globe" /> Global Mode</h1>
            <h3>{"You're successfully uploading to "+stats.membersofActive+" pubs, and downloading updates from "+(Math.max(stats.connected-stats.membersofActive,0))+" others."}</h3>
          </div>
        }
        <div className="toolbar">
          <InviteModalBtn className="btn" onUseInvite={this.onUseInvite.bind(this)} />{' '}
        </div>
      </div>
      {this.state.peers.map((peer, i) => <Peer key={'peer'+i} peer={peer} />)}
    </VerticalFilledContainer>
  }
}