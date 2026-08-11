const axios = require('axios')

async function test() {
  try {
    // 先登录获取 token
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    })
    const token = loginRes.data.token

    // 调用 today-status 接口
    const todayRes = await axios.get('http://localhost:5000/api/check-ins/today-status', {
      headers: { Authorization: `Bearer ${token}` }
    })

    console.log('接口返回:')
    console.log('  morningCheckedIn:', todayRes.data.morningCheckedIn)
    console.log('  eveningCheckedIn:', todayRes.data.eveningCheckedIn)
    console.log('  morningRecord:', todayRes.data.morningRecord ? '有' : '无')
    console.log('  eveningRecord:', todayRes.data.eveningRecord ? '有' : '无')

    if (todayRes.data.morningRecord) {
      console.log('  morningRecord.period:', todayRes.data.morningRecord.period)
      console.log('  morningRecord.checkInTime:', todayRes.data.morningRecord.checkInTime)
    }
    if (todayRes.data.eveningRecord) {
      console.log('  eveningRecord.period:', todayRes.data.eveningRecord.period)
      console.log('  eveningRecord.checkInTime:', todayRes.data.eveningRecord.checkInTime)
    }

  } catch (error) {
    console.error('错误:', error.response?.data || error.message)
  }
}

test()
